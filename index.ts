export {};

type PortalConditionFunction = () => boolean;
type PortalUIVector = mod.Vector | [number, number] | [number, number, number];

interface PortalUIParams {
  name?: string;
  type: string;
  position?: mod.Vector | [number, number] | [number, number, number];
  size?: mod.Vector | [number, number] | [number, number, number];
  anchor?: mod.UIAnchor;
  parent?: mod.UIWidget;
  visible?: boolean;
  textLabel?: string | mod.Message;
  textColor?: PortalUIVector;
  textAlpha?: number;
  textSize?: number;
  textAnchor?: mod.UIAnchor;
  padding?: number;
  bgColor?: PortalUIVector;
  bgAlpha?: number;
  bgFill?: mod.UIBgFill;
  imageType?: mod.UIImageType;
  imageColor?: PortalUIVector;
  imageAlpha?: number;
  teamId?: mod.Team;
  playerId?: mod.Player;
  children?: PortalUIParams[];
  buttonEnabled?: boolean;
  buttonColorBase?: PortalUIVector;
  buttonAlphaBase?: number;
  buttonColorDisabled?: PortalUIVector;
  buttonAlphaDisabled?: number;
  buttonColorPressed?: PortalUIVector;
  buttonAlphaPressed?: number;
  buttonColorHover?: PortalUIVector;
  buttonAlphaHover?: number;
  buttonColorFocused?: PortalUIVector;
  buttonAlphaFocused?: number;
}

declare global {
  type ConditionFunction = PortalConditionFunction;
  type UIVector = PortalUIVector;
  type UIParams = PortalUIParams;

  function Concat(s1: string, s2: string): string;
  function And(...rest: boolean[]): boolean;
  function AndFn(...rest: ConditionFunction[]): boolean;
  function getPlayerId(player: mod.Player): number;
  function getTeamId(team: mod.Team): number;
  function ConvertArray(array: mod.Array): any[];
  function FilteredArray(array: mod.Array, cond: (currentElement: any) => boolean): mod.Array;
  function IndexOfFirstTrue(
    array: mod.Array,
    cond: (element: any, arg: any) => boolean,
    arg?: any
  ): number;
  function IfThenElse<T>(condition: boolean, ifTrue: () => T, ifFalse: () => T): T;
  function IsTrueForAll(
    array: mod.Array,
    condition: (element: any, arg: any) => boolean,
    arg?: any
  ): boolean;
  function IsTrueForAny(
    array: mod.Array,
    condition: (element: any, arg: any) => boolean,
    arg?: any
  ): boolean;
  function SortedArray(array: any[], compare: (a: any, b: any) => number): any[];
  function Equals(a: any, b: any): boolean;
  function WaitUntil(delay: number, cond: () => boolean): Promise<void>;

  class ConditionState {
    lastState: boolean;
    constructor();
    update(newState: boolean): boolean;
  }

  function getPlayerCondition(obj: mod.Player, n: number): ConditionState;
  function getTeamCondition(team: mod.Team, n: number): ConditionState;
  function getCapturePointCondition(obj: mod.CapturePoint, n: number): ConditionState;
  function getMCOMCondition(obj: mod.MCOM, n: number): ConditionState;
  function getVehicleCondition(obj: mod.Vehicle, n: number): ConditionState;
  function getGlobalCondition(n: number): ConditionState;
  function getPlayersInTeam(team: mod.Team): mod.Player[];

  function ParseUI(...params: UIParams[]): mod.UIWidget | undefined;
  function DisplayCustomNotificationMessage(
    msg: mod.Message,
    custom: mod.CustomNotificationSlots,
    duration: number,
    target?: mod.Player | mod.Team
  ): void;
  function ShowEventGameModeMessage(event: mod.Message, target?: mod.Player | mod.Team): void;
  function ShowHighlightedGameModeMessage(event: mod.Message, target?: mod.Player | mod.Team): void;
  function ShowNotificationMessage(msg: mod.Message, target?: mod.Player | mod.Team): void;
  function ClearAllCustomNotificationMessages(target: mod.Player): void;
  function ClearCustomNotificationMessage(
    custom: mod.CustomNotificationSlots,
    target?: mod.Player | mod.Team
  ): void;
}

export type ConditionFunction = PortalConditionFunction;
export type { PortalUIParams as UIParams, PortalUIVector as UIVector };

export declare function Concat(s1: string, s2: string): string;
export declare function And(...rest: boolean[]): boolean;
export declare function AndFn(...rest: ConditionFunction[]): boolean;
export declare function getPlayerId(player: mod.Player): number;
export declare function getTeamId(team: mod.Team): number;
export declare function ConvertArray(array: mod.Array): any[];
export declare function FilteredArray(
  array: mod.Array,
  cond: (currentElement: any) => boolean
): mod.Array;
export declare function IndexOfFirstTrue(
  array: mod.Array,
  cond: (element: any, arg: any) => boolean,
  arg?: any
): number;
export declare function IfThenElse<T>(
  condition: boolean,
  ifTrue: () => T,
  ifFalse: () => T
): T;
export declare function IsTrueForAll(
  array: mod.Array,
  condition: (element: any, arg: any) => boolean,
  arg?: any
): boolean;
export declare function IsTrueForAny(
  array: mod.Array,
  condition: (element: any, arg: any) => boolean,
  arg?: any
): boolean;
export declare function SortedArray(array: any[], compare: (a: any, b: any) => number): any[];
export declare function Equals(a: any, b: any): boolean;
export declare function WaitUntil(delay: number, cond: () => boolean): Promise<void>;

export declare class ConditionState {
  lastState: boolean;
  constructor();
  update(newState: boolean): boolean;
}

export declare function getPlayerCondition(obj: mod.Player, n: number): ConditionState;
export declare function getTeamCondition(team: mod.Team, n: number): ConditionState;
export declare function getCapturePointCondition(
  obj: mod.CapturePoint,
  n: number
): ConditionState;
export declare function getMCOMCondition(obj: mod.MCOM, n: number): ConditionState;
export declare function getVehicleCondition(obj: mod.Vehicle, n: number): ConditionState;
export declare function getGlobalCondition(n: number): ConditionState;
export declare function getPlayersInTeam(team: mod.Team): mod.Player[];

export declare function ParseUI(...params: UIParams[]): mod.UIWidget | undefined;
export declare function DisplayCustomNotificationMessage(
  msg: mod.Message,
  custom: mod.CustomNotificationSlots,
  duration: number,
  target?: mod.Player | mod.Team
): void;
export declare function ShowEventGameModeMessage(
  event: mod.Message,
  target?: mod.Player | mod.Team
): void;
export declare function ShowHighlightedGameModeMessage(
  event: mod.Message,
  target?: mod.Player | mod.Team
): void;
export declare function ShowNotificationMessage(
  msg: mod.Message,
  target?: mod.Player | mod.Team
): void;
export declare function ClearAllCustomNotificationMessages(target: mod.Player): void;
export declare function ClearCustomNotificationMessage(
  custom: mod.CustomNotificationSlots,
  target?: mod.Player | mod.Team
): void;
