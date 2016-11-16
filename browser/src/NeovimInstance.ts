import { EventEmitter } from "events";
import * as path from "path";
import * as cp from "child_process";
import * as os from "os";
import * as Q from "q";
import { remote } from "electron"

const attach = require("neovim-client");

import * as Actions from "./actions";
import { measureFont } from "./measureFont";
import * as Config from "./Config"
import { PixelPosition, Position } from "./Screen"
import { PluginManager } from "./Plugins/PluginManager"

export interface INeovimInstance {
    cursorPosition: Position;
    screenToPixels(row: number, col: number): PixelPosition

    input(inputString: string);
    command(command: string);

    on(event: string, handler: Function);

    setFont(fontFamily: string, fontSize: string);
}

/**
 * Integration with NeoVim API
 */
export class NeovimInstance extends EventEmitter implements INeovimInstance {
    private _neovim: any;
    private _initPromise: any;

    private _fontFamily: string = Config.getValue<string>("editor.fontFamily");
    private _fontSize: string = Config.getValue<string>("editor.fontSize");
    private _fontWidthInPixels: number;
    private _fontHeightInPixels: number;

    private _lastHeightInPixels: number;
    private _lastWidthInPixels: number;

    private _pluginManager: PluginManager;

    public setFont(fontFamily: string, fontSize: string): void {
        this._fontFamily = fontFamily;
        this._fontSize = fontSize;

        const {width, height} = measureFont(this._fontFamily, this._fontSize);

        this._fontWidthInPixels = width
        this._fontHeightInPixels = height

        this.emit("action", Actions.setFont(fontFamily, fontSize, width, height));

        this.resize(this._lastWidthInPixels, this._lastHeightInPixels)
    }

    public get cursorPosition(): Position {
        return {
            row: 0,
            column: 0
        }
    }

    public screenToPixels(row: number, col: number): PixelPosition {
        return {
            x: 0,
            y: 0
        }
    }

    public input(inputString: string): void {
        this._neovim.input(inputString)
    }

    public command(commandString: string): void {
        this._neovim.command(commandString)
    }

    public resize(widthInPixels: number, heightInPixels: number): void {
        this._lastWidthInPixels = widthInPixels
        this._lastHeightInPixels = heightInPixels

        const rows = Math.floor(heightInPixels / this._fontHeightInPixels)
        const cols = Math.floor(widthInPixels / this._fontWidthInPixels)

        this._resizeInternal(rows, cols)
    }

    private _resizeInternal(rows: number, columns: number): void {

        if(Config.hasValue("debug.fixedSize")) {
            const fixedSize = Config.getValue<any>("debug.fixedSize")
            rows = fixedSize.rows
            columns = fixedSize.columns
            console.warn ("Overriding screen size based on debug.fixedSize")
        }

        this._initPromise.then(() => {
            this._neovim.uiTryResize(columns, rows, function(err) {
                if(err)
                    console.error(err)
            });
        });
    }

    constructor(pluginManager: PluginManager, widthInPixels: number, heightInPixels: number) {
        super()

        this._pluginManager = pluginManager;

        this._lastWidthInPixels = widthInPixels
        this._lastHeightInPixels = heightInPixels

        const files = remote.getGlobal("args")
        const initVimPath = this._pluginManager.generateInitVim()

        this._initPromise = startNeovim(initVimPath, files)
            .then((nv) => {
                console.log("NevoimInstance: Neovim started");

                nv.command("colorscheme onedark")

                this._neovim = nv;

                this._neovim.on("notification", (method, args) => {
                    if(method === "redraw") {
                        this._handleNotification(method, args);
                    } else if(method === "oni_plugin_notify"){
                        var pluginArgs = args[0];
                        var pluginMethod = pluginArgs.shift()
                        this._pluginManager.handleNotification(pluginMethod, args)
                    } else {
                        console.warn("Unknown notification: " + method);
                    }
                });

                this._neovim.on("request", (method, args, resp) => {
                    console.warn("Unhandled request: " + method);
                });

                this._neovim.on("disconnect", () => {
                    require("electron").remote.app.quit()
                })

                this._neovim.uiAttach(80, 40, true, (err) => {
                    console.log("Attach success");

                    this._pluginManager.startPlugins(this)
                });
            })

        this.setFont("Consolas", "14px");
    }

    private _handleNotification(method, args): void {
       args.forEach((a) => {
           var command = a[0];
           a.shift();

           if(command === "cursor_goto"){
               this.emit("action", Actions.createCursorGotoAction(a[0][0], a[0][1]));
           } else if(command === "put") {

               var charactersToPut = a.map(v => v[0]);
               this.emit("action", Actions.put(charactersToPut))
           } else if(command === "set_scroll_region") {
                var param = a[0]
                this.emit("action", Actions.setScrollRegion(param[0], param[1], param[2], param[3]))
           } else if(command === "scroll") {
               this.emit("action", Actions.scroll(a[0][0]))
           } else if(command === "highlight_set") {

               var count = a.length;

               var highlightInfo = a[count - 1][0]

               this.emit("action", Actions.setHighlight(
                   !!highlightInfo.bold,
                   !!highlightInfo.italic,
                   !!highlightInfo.reverse,
                   !!highlightInfo.underline,
                   !!highlightInfo.undercurl,
                   highlightInfo.foreground,
                   highlightInfo.background
               ))
           } else if(command === "resize") {
               this.emit("action", Actions.resize(a[0][0], a[0][1]))
           } else if(command === "eol_clear") {
               this.emit("action", Actions.clearToEndOfLine())
           } else if(command === "clear") {
               this.emit("action", Actions.clear())
           } else if(command === "mouse_on") {
               // TODO
           } else if(command === "update_bg") {
               this.emit("action", Actions.updateBackground(a[0][0]))
           } else if(command === "update_fg") {
               this.emit("action", Actions.updateForeground(a[0][0]))
           } else if(command === "mode_change") {
               const newMode = a[0][0]
               this.emit("action", Actions.changeMode(newMode))
               this.emit("mode-change", newMode)
           } else {
               console.warn("Unhandled command: " + command);
           }
       })
    }
}

var attachAsPromise = Q.denodeify(attach)

function startNeovim(initVimPath, args): Q.IPromise<any> {
    const isOSX = os.platform() === "darwin"

    const nvimWindowsProcessPath = path.join(__dirname, "bin", "x86", "Neovim", "bin", "nvim.exe")
    // For Mac, assume there is a locally installed neovim
    // TODO: Instructions if neovim ins not installed
    const nvimMacProcessPath = "nvim"
    const nvimProcessPath = isOSX ? nvimMacProcessPath : nvimWindowsProcessPath

    var argsToPass = ['-u', initVimPath, '-N', '--embed', "--"].concat(args)

    var nvim_proc = cp.spawn(nvimProcessPath, argsToPass, {});

    return attachAsPromise(nvim_proc.stdin, nvim_proc.stdout);
}