/**
 * State.ts
 *
 * This file describes the Redux state of the app
 */

import * as Config from  "./../Config"
import { ILog } from "./Logs"
import { Rectangle } from "./Types"

export interface IState {
    cursorPixelX: number
    cursorPixelY: number
    cursorPixelWidth: number
    cursorCharacter: string
    fontPixelWidth: number
    fontPixelHeight: number
    mode: string
    backgroundColor: string
    foregroundColor: string
    autoCompletion: null | IAutoCompletionInfo
    quickInfo: null | Oni.Plugin.QuickInfo
    popupMenu: null | IMenu
    signatureHelp: null | Oni.Plugin.SignatureHelpResult
    cursorLineVisible: boolean
    cursorLineOpacity: number
    cursorColumnVisible: boolean
    cursorColumnOpacity: number
    configuration: Config.IConfigValues

    statusBar: IStatusBarItem[]

    logsVisible: boolean
    logs: Array<{
        log: ILog,
        folded: boolean,
    }>

    // Dimensions of active window, in pixels
    activeWindowDimensions: Rectangle
}

export enum StatusBarAlignment {
    Left,
    Right,
}

export interface IStatusBarItem {
    alignment: StatusBarAlignment
    contentsHTML: string
    id: string
    priority: number
}

export function readConf <K extends keyof Config.IConfigValues>(conf: Config.IConfigValues, k: K): Config.IConfigValues[K] {
    return conf[k]
}

export interface IMenu {
    id: string,
    filter: string,
    filteredOptions: IMenuOptionWithHighlights[],
    options: Oni.Menu.MenuOption[],
    selectedIndex: number
}

export interface IMenuOptionWithHighlights extends Oni.Menu.MenuOption {
    labelHighlights: number[][],
    detailHighlights: number[][]
}

export interface IAutoCompletionInfo {

    /**
     * Base entry being completed against
     */
    base: string

    entries: Oni.Plugin.CompletionInfo[]

    /**
     * Label of selected entry
     */
    selectedIndex: number
}
export const createDefaultState = (): IState => ({
    cursorPixelX: 10,
    cursorPixelY: 10,
    cursorPixelWidth: 10,
    cursorCharacter: "",
    fontPixelWidth: 10,
    fontPixelHeight: 10,
    mode: "normal",
    foregroundColor: "rgba(0, 0, 0, 0)",
    autoCompletion: null,
    quickInfo: null,
    popupMenu: null,
    signatureHelp: null,
    activeWindowDimensions: {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
    },
    cursorLineVisible: false,
    cursorLineOpacity: 0,
    cursorColumnVisible: false,
    cursorColumnOpacity: 0,
    backgroundColor: "#000000",
    logsVisible: false,
    logs: [],
    configuration: Config.instance().getValues(),
    statusBar: [{
        alignment: StatusBarAlignment.Left,
        contentsHTML: "Test",
        id: "test_1",
        priority: 1,
    }, {
        alignment: StatusBarAlignment.Right,
        contentsHTML: "Test-Right",
        id: "test_2",
        priority: 1,
    }],
})
