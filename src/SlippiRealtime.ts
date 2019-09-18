import _ from "lodash";
/* eslint-disable no-param-reassign */
import EventEmitter from "events";
import { Readable } from 'stream';
import { SlpStream, SlpEvent } from './utils/slpStream';
import { SlpParser } from './utils/slpParser';
import { FramesType, StatsType, FrameEntryType } from './SlippiGame';
import { GameStartType, MetadataType, GameEndType, Command, PostFrameUpdateType, PreFrameUpdateType } from './utils/slpReader';
import { getSinglesOpponentIndicesFromSettings, PlayerIndexedType } from "./stats/common";
import { Stats } from "./stats/stats";

/**
 * Slippi Game class that wraps a read stream
 */
export class SlippiRealtime extends EventEmitter {
  private stream: SlpStream;
  private parser: SlpParser;
  private settings: GameStartType | null;
  private playerFrames: FramesType | null;
  private followerFrames: FramesType | null;
  private stats: StatsType | null;
  private metadata: MetadataType | null;
  private gameEnd: GameEndType | null;
  private latestFrameIndex: number | null;
  private frameReadPos: number | null;
  private playerIndices: PlayerIndexedType[] = [];
  private statsComputer: Stats | null = null;

  public constructor(stream: Readable) {
    super();
    this.frameReadPos = null;
    this.latestFrameIndex = null;
    this.parser = new SlpParser();
    this.stream = new SlpStream(stream);
  }

  public start(): void {
    this.stream.on(SlpEvent.GAME_START, (command: Command, payload: GameStartType) => {
      this.parser.handleGameStart(payload);
      this.playerIndices = getSinglesOpponentIndicesFromSettings(this.parser.getSettings());
      this.statsComputer = new Stats(this.playerIndices);
      this.emit("gameStart");
    });

    this.stream.on(SlpEvent.POST_FRAME_UPDATE, (command: Command, payload: PostFrameUpdateType) => {
      this.parser.handlePostFrameUpdate(payload);
      this._onFrameUpdate(command, payload);
    });

    this.stream.on(SlpEvent.PRE_FRAME_UPDATE, (command: Command, payload: PreFrameUpdateType) => {
      this._onFrameUpdate(command, payload);
    });

    this.stream.on(SlpEvent.GAME_END, (command: Command, payload: GameEndType) => {
      this.parser.handleGameEnd(payload);
      this.emit("gameEnd");
    });

    this.stream.on("end", () => {
      this.emit("end");
    });
  }

  private _onFrameUpdate(command: Command, payload: PostFrameUpdateType | PreFrameUpdateType): void {
    const frame = this.parser.handleFrameUpdate(command, payload)
    if (isCompletedFrame(this.playerIndices, frame)) {
      this.statsComputer.processFrame(frame);
      this.emit("newFrame", frame);
    };
  }

}

function isCompletedFrame(opponentIndices: PlayerIndexedType[], frame: FrameEntryType): boolean {
    for (const indices of opponentIndices) {
        const playerPostFrame = _.get(frame, ['players', indices.playerIndex, 'post']);
        const oppPostFrame = _.get(frame, ['players', indices.opponentIndex, 'post']);
        if (!playerPostFrame || !oppPostFrame) {
            return false;
        }
    }
    return true;
}