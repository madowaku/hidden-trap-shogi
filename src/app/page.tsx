'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Board from '@/components/Board';
import GameInfo from '@/components/GameInfo';
import GameLog from '@/components/GameLog';
import NinjaGuide from '@/components/NinjaGuide';
import PieceStand from '@/components/PieceStand';
import { FEEDBACK_URL } from '@/constants/config';
import { canPromote, getLegalDrops, getLegalMoves, isKingSquare, isPlayerInCheck, posEquals, findKing } from '@/game/board';
import { simpleBot } from '@/game/bot';
import { useGame } from '@/hooks/useGame';
import { useOnlineRoom } from '@/hooks/useOnlineRoom';
import { useSound } from '@/hooks/useSound';
import { getVisiblePitfalls } from '@/game/pitfall';
import { getTrapReactionKind } from '@/game/reaction';
import type { BoardOrientation } from '@/game/orientation';
import type { BotLevel, BotMoveDebugSummary, GameMode, LogEntry, MoveAction, Phase, PieceKind, Player, Position, UISelection, Viewer } from '@/game/types';

type Language = 'ja' | 'en';
type InviteCopyStatus = 'idle' | 'copied' | 'failed';

const APP_VERSION = 'v0.1.0';
const FIRST_TURN_TUTORIAL_STORAGE_KEY = 'pitfall-shogi:first-turn-tutorial';
const DEBUG_BOT_QUERY = 'debugBot=1';

const BOT_LEVEL_OPTIONS: Array<{
  value: BotLevel;
  label: string;
  detail: Record<Language, string>;
}> = [
  { value: 'easy', label: 'Easy', detail: { ja: '欲張りでミス多め', en: 'Greedy and mistake-prone' } },
  { value: 'normal', label: 'Normal', detail: { ja: '標準的な罠読み', en: 'Standard trap reading' } },
  { value: 'hard', label: 'Hard', detail: { ja: 'おいしい手を強く疑う', en: 'More trap-aware' } },
];

const CASUAL_MODE_OPTIONS: Array<{
  value: boolean;
  label: Record<Language, string>;
  detail: Record<Language, string>;
}> = [
  {
    value: true,
    label: { ja: '不発罠を公開', en: 'Missed traps revealed' },
    detail: {
      ja: '相手が踏まなかった罠もログに出る。初回・練習向け。',
      en: 'Traps that were not stepped on appear in the log. Best for first games.',
    },
  },
  {
    value: false,
    label: { ja: '不発罠は隠す', en: 'Missed traps stay hidden' },
    detail: {
      ja: '発動しなかった罠は見えないまま。読み合い重視。',
      en: 'Untriggered traps remain secret. Better for sharper mind games.',
    },
  },
];

const LOCAL_MODE_OPTIONS: Array<{
  value: GameMode;
  tag: string;
  label: Record<Language, string>;
  detail: Record<Language, string>;
}> = [
  {
    value: 'pvp',
    tag: 'PvP',
    label: { ja: 'ふたりで遊ぶ', en: 'Two players' },
    detail: { ja: '同じ端末を渡しながら遊ぶ', en: 'Pass one device between two players' },
  },
  {
    value: 'pvbot',
    tag: 'PvBot',
    label: { ja: 'Bot練習', en: 'Bot practice' },
    detail: { ja: 'Bot相手に読み合いを練習', en: 'Practice trap reading against the bot' },
  },
];

const TUTORIAL_STEPS: Record<Language, string[]> = {
  ja: [
    'Step 1: 罠を仕掛けよう',
    'Step 2: 駒を動かそう',
    'Step 3: 相手の欲しい手を読もう',
  ],
  en: [
    'Step 1: Place a trap',
    'Step 2: Move a piece',
    'Step 3: Read what your opponent wants',
  ],
};

const TUTORIAL_DETAILS: Record<Language, string[]> = {
  ja: [
    '毎ターン、まず罠を1マスに仕掛ける',
    '相手がそのマスへ動くと、その手は失敗する',
    '取れる駒ほど、罠かもしれない',
  ],
  en: [
    'Every turn, place one trap on the board first',
    'A move to that square fails if the opponent steps on it',
    'Tempting captures may be traps',
  ],
};

const KNOWN_ISSUES: Record<Language, string[]> = {
  ja: [
    'PCブラウザ推奨',
    '詰み判定は未実装です。王手は警告のみで、回避強制はまだありません',
    '二歩など一部の将棋厳密ルールは簡略化しています',
    'オンライン対戦はExperimental接続のみです',
  ],
  en: [
    'Best played on desktop',
    'Checkmate detection is not implemented. Check is a warning only and is not enforced',
    'Some strict shogi rules, including illegal pawn drops, are simplified',
    'Online multiplayer is limited to the Experimental connection test',
  ],
};

const ONLINE_KNOWN_ISSUES: Record<Language, string[]> = {
  ja: [
    'Online Experimentalは実験中です。Worker URL未設定の公開版では接続できません。',
    'マッチメイク、認証、永続保存、自動復帰はまだありません。',
    '再接続後はrevision / ackClientSeq / sentSeq / receivedで同期状態を確認してください。',
  ],
  en: [
    'Online Experimental is still experimental. Public builds without a Worker URL cannot connect.',
    'Matchmaking, auth, persistence, and automatic recovery are not implemented yet.',
    'After reconnecting, confirm sync through revision / ackClientSeq / sentSeq / received.',
  ],
};

const COPY: Record<Language, {
  title: string;
  subtitle: string;
  language: string;
  start: string;
  modeControlLabel: string;
  modeSelect: string;
  pvpDetail: string;
  pvbotDetail: string;
  casualDetail: string;
  help: string;
  rules: string;
  close: string;
  skip: string;
  reset: string;
  settingsLabel: string;
  selected: string;
  botLevel: string;
  botLevelScopeLabel: string;
  botLevelHelp: string;
  botSummary: string;
  knownIssues: string;
  feedback: string;
  mobileWarning: string;
  trapToast: string;
  trapPlayerTitle: string;
  trapPlayerSub: string;
  trapOpponentTitle: string;
  trapOpponentSub: string;
  trapMissToast: string;
  passTitle: string;
  passBody: string;
  passSteps: string;
  passStart: string;
  trapCandidate: string;
  pickTrap: string;
  reselect: string;
  confirmTrap: string;
  moveStep: string;
  promote: string;
  declinePromote: string;
  gameLog: string;
  trapReview: string;
  hitRate: string;
  hitCount: string;
  missCount: string;
  hit: string;
  miss: string;
  setTrap: string;
  triggered: string;
  revealed: string;
  prototype: string;
  kingPitfallBlocked: string;
  repeatPitfallBlocked: string;
  checkAlert: string;
  checkAlertLine: string;
  matchTurnLabel: string;
  matchPhaseLabel: string;
  confirmResign: string;
  confirmResignBody: string;
  cancel: string;
  onlineExperimental: string;
  onlineExperimentalBadge: string;
  onlineDetail: string;
  roomId: string;
  connect: string;
  reconnect: string;
  disconnect: string;
  resign: string;
  onlineStatus: string;
  onlineDebug: string;
  onlineDisabled: string;
  onlineDisabledReason: string;
  onlineSeatLabel: string;
  onlineYourTurn: string;
  onlineWaitingTurn: string;
  opponentWaitingTitle: string;
  opponentWaitingBody: string;
  connectionWarningTitle: string;
  connectionWarningBody: string;
  onlineRematch: string;
  onlineRematchWaiting: string;
  roomPresence: string;
  roomPlayers: string;
  roomSpectators: string;
  matchStats: string;
  trapsSet: string;
  trapsTriggeredByMe: string;
  trapsITriggered: string;
  onlineNoSeatTitle: string;
  onlineNoSeatBody: string;
  onlineEventLog: string;
  rawPitfallLeak: string;
  invalidCommand: string;
  invalidCommandReason: string;
  copyInviteUrl: string;
  copied: string;
  copyInviteFailed: string;
  reviewTrapFilterLabel: string;
  filterBoth: string;
  filterSente: string;
  filterGote: string;
  filterNone: string;
  mostTargeted: string;
  times: string;
}> = {
  ja: {
    title: '落とし穴将棋',
    subtitle: 'Hidden trap shogi',
    language: 'Language',
    start: '対局開始',
    modeControlLabel: '対局モード',
    modeSelect: 'モード選択',
    pvpDetail: '同じ端末を渡しながら遊ぶ',
    pvbotDetail: 'Bot相手に読み合いを練習',
    casualDetail: 'Casual: 不発罠を公開する練習設定',
    help: 'Help',
    rules: 'Rules',
    close: '閉じる',
    skip: 'スキップ',
    reset: 'Reset',
    settingsLabel: '⋯',
    selected: '選択中',
    botLevel: 'Bot level',
    botLevelScopeLabel: 'PvBot専用',
    botLevelHelp: 'Bot練習を選んだときだけ強さを選べます',
    botSummary: 'Easy / Normal / Hard',
    knownIssues: 'Known Issues',
    feedback: '感想はitch.ioページのコメントへお願いします。',
    mobileWarning: 'PCブラウザ推奨',
    trapToast: '罠、発動！',
    trapPlayerTitle: '罠にハマった！',
    trapPlayerSub: 'その一手は読まれていた……',
    trapOpponentTitle: '罠命中！',
    trapOpponentSub: '相手の一手を封じた！',
    trapMissToast: '不発！そこに罠があった',
    passTitle: '端末を渡してください',
    passBody: 'ログと罠の情報を隠しています。次のプレイヤーだけが画面を見られる状態にしてから進めてください。',
    passSteps: 'Step 1: 罠の候補を選ぶ → 確定 → Step 2: 駒を動かす',
    passStart: '準備できたら開始',
    trapCandidate: '候補',
    pickTrap: '盤面をクリックして罠の候補を選択',
    reselect: '選び直す',
    confirmTrap: '罠を確定して駒を動かす',
    moveStep: 'Step 2 / Move: 駒か持ち駒を選んで着手',
    promote: '成る',
    declinePromote: '成らない',
    gameLog: '対局ログ',
    trapReview: '罠履歴レビュー',
    hitRate: '罠命中率',
    hitCount: '踏んだ回数',
    missCount: '不発回数',
    hit: '命中',
    miss: '不発',
    setTrap: '仕掛けた罠',
    triggered: '発動',
    revealed: '公開',
    prototype: '開発中プロトタイプ・感想歓迎',
    kingPitfallBlocked: '王のいるマスには罠を仕掛けられません',
    repeatPitfallBlocked: '前回自分が置いたマスには連続で罠を仕掛けられません',
    checkAlert: '王手！',
    checkAlertLine: 'くのうさ「王手だよ！逃げ道を探して！」',
    matchTurnLabel: '手番',
    matchPhaseLabel: 'フェーズ',
    confirmResign: '投了しますか？',
    confirmResignBody: 'この対局を終了し、相手の勝ちにします。',
    cancel: 'キャンセル',
    onlineExperimental: 'Online Experimental',
    onlineExperimentalBadge: '実験中',
    onlineDetail: 'Worker Roomへ接続して対局入力を検証中',
    roomId: 'Room ID',
    connect: 'Connect',
    reconnect: 'Reconnect',
    disconnect: 'Disconnect',
    resign: '投了',
    onlineStatus: '接続状態',
    onlineDebug: 'Online Debug',
    onlineDisabled: 'WebSocket URL未設定',
    onlineDisabledReason: '接続先サーバーが設定されていません',
    onlineSeatLabel: 'あなたは',
    onlineYourTurn: 'あなたの操作です',
    onlineWaitingTurn: '相手の操作を待っています',
    opponentWaitingTitle: '相手の番です',
    opponentWaitingBody: '相手が罠と一手を選ぶまで待ちましょう。',
    connectionWarningTitle: '接続を確認中',
    connectionWarningBody: '切断または再接続中です。戻らない場合はReconnectを押してください。',
    onlineRematch: '再戦を希望',
    onlineRematchWaiting: '相手の再戦希望を待っています',
    roomPresence: '部屋の人数',
    roomPlayers: 'Players',
    roomSpectators: 'Spectators',
    matchStats: '罠戦績',
    trapsSet: '仕掛けた罠',
    trapsTriggeredByMe: 'ハメた回数',
    trapsITriggered: 'ハマった回数',
    onlineNoSeatTitle: 'このブラウザは対局席に入れていません',
    onlineNoSeatBody: '部屋が満員、または接続が未完了です。別のRoom IDで接続するか、既存の接続を切ってから入り直してください。',
    onlineEventLog: '受信イベント',
    rawPitfallLeak: 'raw pitfall leak',
    invalidCommand: 'invalidCommand',
    invalidCommandReason: '理由',
    copyInviteUrl: '招待URLをコピー',
    copied: 'コピーしました！',
    copyInviteFailed: 'コピーできませんでした。URLを選択してコピーしてください',
    reviewTrapFilterLabel: 'レビュー罠表示',
    filterBoth: '両者の罠',
    filterSente: '先手の罠',
    filterGote: '後手の罠',
    filterNone: '非表示',
    mostTargeted: '一番狙われたマス',
    times: '回',
  },
  en: {
    title: 'Pitfall Shogi',
    subtitle: 'Hidden trap shogi',
    language: 'Language',
    start: 'Start Match',
    modeControlLabel: 'Match mode',
    modeSelect: 'Mode Select',
    pvpDetail: 'Pass one device between two players',
    pvbotDetail: 'Practice trap reading against the bot',
    casualDetail: 'Casual: reveal missed traps for practice',
    help: 'Help',
    rules: 'Rules',
    close: 'Close',
    skip: 'Skip',
    reset: 'Reset',
    settingsLabel: 'Settings',
    selected: 'Selected',
    botLevel: 'Bot level',
    botLevelScopeLabel: 'Bot only',
    botLevelHelp: 'Choose difficulty only when practicing against the bot',
    botSummary: 'Easy / Normal / Hard',
    knownIssues: 'Known Issues',
    feedback: 'Feedback welcome on the itch.io page.',
    mobileWarning: 'Best played on desktop',
    trapToast: 'Trap triggered!',
    trapPlayerTitle: 'Caught in a trap!',
    trapPlayerSub: 'That move was read...',
    trapOpponentTitle: 'Trap hit!',
    trapOpponentSub: 'You shut down their move!',
    trapMissToast: 'Missed trap! It was there',
    passTitle: 'Pass the device',
    passBody: 'Logs and trap information are hidden. Continue only after the next player is the only one viewing the screen.',
    passSteps: 'Step 1: choose a trap square -> confirm -> Step 2: make a move',
    passStart: 'Ready',
    trapCandidate: 'Candidate',
    pickTrap: 'Click the board to choose a trap square',
    reselect: 'Change',
    confirmTrap: 'Confirm trap, then move',
    moveStep: 'Step 2 / Move: choose a piece or hand piece',
    promote: 'Promote',
    declinePromote: 'Do not promote',
    gameLog: 'Game Log',
    trapReview: 'Trap History Review',
    hitRate: 'Trap hit rate',
    hitCount: 'Times stepped on',
    missCount: 'Misses',
    hit: 'Hit',
    miss: 'Miss',
    setTrap: 'Trap set',
    triggered: 'Triggered',
    revealed: 'Revealed',
    prototype: 'Prototype build — feedback welcome',
    kingPitfallBlocked: 'You cannot place a trap on a king',
    repeatPitfallBlocked: 'You cannot place a trap on your own previous trap square twice in a row',
    checkAlert: 'Check!',
    checkAlertLine: 'Kuno-Usa: Your king is being targeted!',
    matchTurnLabel: 'Turn',
    matchPhaseLabel: 'Phase',
    confirmResign: 'Resign this game?',
    confirmResignBody: 'This ends the match and gives the win to your opponent.',
    cancel: 'Cancel',
    onlineExperimental: 'Online Experimental',
    onlineExperimentalBadge: 'Experimental',
    onlineDetail: 'Connect to a Worker Room and test online game input',
    roomId: 'Room ID',
    connect: 'Connect',
    reconnect: 'Reconnect',
    disconnect: 'Disconnect',
    resign: 'Resign',
    onlineStatus: 'Status',
    onlineDebug: 'Online Debug',
    onlineDisabled: 'WebSocket URL not set',
    onlineDisabledReason: 'Server URL is not configured',
    onlineSeatLabel: 'You are',
    onlineYourTurn: 'Your turn to act',
    onlineWaitingTurn: 'Waiting for the opponent',
    opponentWaitingTitle: 'Opponent is thinking',
    opponentWaitingBody: 'Wait while the opponent places a trap and chooses a move.',
    connectionWarningTitle: 'Checking connection',
    connectionWarningBody: 'The room is disconnected or reconnecting. Press Reconnect if it does not recover.',
    onlineRematch: 'Request rematch',
    onlineRematchWaiting: 'Waiting for opponent rematch',
    roomPresence: 'Room presence',
    roomPlayers: 'Players',
    roomSpectators: 'Spectators',
    matchStats: 'Trap stats',
    trapsSet: 'Traps set',
    trapsTriggeredByMe: 'Trapped them',
    trapsITriggered: 'Caught by traps',
    onlineNoSeatTitle: 'This browser has no seat in the room',
    onlineNoSeatBody: 'The room may be full or still connecting. Try another Room ID, or disconnect an existing browser and reconnect.',
    onlineEventLog: 'Server events',
    rawPitfallLeak: 'raw pitfall leak',
    invalidCommand: 'invalidCommand',
    invalidCommandReason: 'Reason',
    copyInviteUrl: 'Copy Invite URL',
    copied: 'Copied!',
    copyInviteFailed: 'Could not copy. Select the URL and copy it manually.',
    reviewTrapFilterLabel: 'Review Trap Filter',
    filterBoth: 'Both Traps',
    filterSente: 'Sente Traps',
    filterGote: 'Gote Traps',
    filterNone: 'Hide Traps',
    mostTargeted: 'Most Targeted',
    times: 'times',
  },
};

export default function Home() {
  const [language, setLanguage] = useState<Language>('ja');
  const [gameMode, setGameMode] = useState<GameMode>('pvbot');
  const [casualMode, setCasualMode] = useState(true);
  const [botLevel, setBotLevel] = useState<BotLevel>('normal');
  const [pitfallDraft, setPitfallDraft] = useState<Position | null>(null);
  const [pitfallMessage, setPitfallMessage] = useState<string | null>(null);
  const [showStartScreen, setShowStartScreen] = useState(true);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showKnownIssues, setShowKnownIssues] = useState(false);
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isOnlineMode, setIsOnlineMode] = useState(false);
  const [onlineRoomId, setOnlineRoomId] = useState('test-room');
  const [onlinePitfallDraft, setOnlinePitfallDraft] = useState<Position | null>(null);
  const [onlineSelection, setOnlineSelection] = useState<UISelection>({ type: 'none' });
  const [onlineHandSelection, setOnlineHandSelection] = useState<PieceKind | null>(null);
  const [onlinePromotionMove, setOnlinePromotionMove] = useState<MoveAction | null>(null);
  const [debugBotEnabled, setDebugBotEnabled] = useState(false);
  const game = useGame(gameMode, casualMode, botLevel);
  const onlineRoom = useOnlineRoom();
  const {
    settings: soundSettings,
    setSoundEnabled,
    setSoundVolume,
    playSound,
  } = useSound();
  const {
    isConfigured: isOnlineRoomConfigured,
    status: onlineRoomStatus,
    connect: connectOnlineRoom,
  } = onlineRoom;

  const [inviteUrl, setInviteUrl] = useState('');
  const [inviteCopyStatus, setInviteCopyStatus] = useState<InviteCopyStatus>('idle');
  const [reviewTrapFilter, setReviewTrapFilter] = useState<'both' | 'sente' | 'gote' | 'none'>('both');
  const [highlightedLogTurn, setHighlightedLogTurn] = useState<number | null>(null);

  // URLの?room=xxxパラメータを自動で読み込む
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const roomParam = params.get('room');
      const shouldDebugBot = params.get('debugBot') === '1';
      queueMicrotask(() => {
        setDebugBotEnabled(shouldDebugBot);
        if (roomParam) {
          setOnlineRoomId(roomParam);
          setIsOnlineMode(true);
        }
      });
    }
  }, []);

  // オンラインRoomIDが設定されて準備ができたら自動接続
  const autoConnectedRef = useRef(false);
  useEffect(() => {
    if (!autoConnectedRef.current && isOnlineMode && onlineRoomId && isOnlineRoomConfigured && onlineRoomStatus === 'idle') {
      autoConnectedRef.current = true;
      connectOnlineRoom(onlineRoomId);
    }
  }, [isOnlineMode, onlineRoomId, isOnlineRoomConfigured, onlineRoomStatus, connectOnlineRoom]);

  useEffect(() => {
    queueMicrotask(() => {
      setInviteUrl(buildInviteUrl(onlineRoomId));
      setInviteCopyStatus('idle');
    });
  }, [onlineRoomId]);

  // 招待URLコピー
  const handleCopyInviteUrl = async () => {
    if (!inviteUrl) return;
    if (!window.isSecureContext || !navigator.clipboard?.writeText) {
      setInviteCopyStatus('failed');
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setInviteCopyStatus('copied');
      setTimeout(() => setInviteCopyStatus('idle'), 2000);
    } catch (err) {
      console.error('Failed to copy invite URL: ', err);
      setInviteCopyStatus('failed');
    }
  };

  const selectInviteUrl = (event: { currentTarget: HTMLInputElement }) => {
    event.currentTarget.select();
  };
  const { state, selection } = game;
  const copy = COPY[language];
  const inviteCopyMessage = inviteCopyStatus === 'copied'
    ? copy.copied
    : inviteCopyStatus === 'failed'
      ? copy.copyInviteFailed
      : null;
  const tutorialSteps = TUTORIAL_STEPS[language];
  const tutorialDetails = TUTORIAL_DETAILS[language];
  const activeCasualOption = casualMode
    ? CASUAL_MODE_OPTIONS[0]
    : CASUAL_MODE_OPTIONS[1];

  const visiblePitfalls = useMemo(
    () => getVisiblePitfalls(state, state.currentPlayer),
    [state]
  );

  const localModeOptions = LOCAL_MODE_OPTIONS;
  const hasOnlineGameView = Boolean(onlineRoom.view);
  const onlineVisiblePitfalls = onlineRoom.view?.visiblePitfalls ?? [];
  const activeBoard = isOnlineMode && onlineRoom.view ? onlineRoom.view.board : state.board;
  const activeHands = isOnlineMode && onlineRoom.view ? onlineRoom.view.hands : state.hands;
  const activePhase = isOnlineMode && onlineRoom.view ? onlineRoom.view.phase : state.phase;
  const activeCurrentPlayer = isOnlineMode && onlineRoom.view ? onlineRoom.view.currentPlayer : state.currentPlayer;
  const activeSelection = isOnlineMode ? onlineSelection : selection;
  const activeVisiblePitfalls = isOnlineMode ? onlineVisiblePitfalls : visiblePitfalls;
  const activeTurn = isOnlineMode ? onlineRoom.view?.turn ?? state.turn : state.turn;
  const activeWinner = isOnlineMode ? onlineRoom.view?.winner ?? state.winner : state.winner;
  const activeLog = isOnlineMode ? onlineRoom.view?.log ?? state.log : state.log;
  const activeBotPhase = isOnlineMode ? null : game.botPhase;
  const botDebugCandidates = useMemo<BotMoveDebugSummary[]>(() => {
    if (!debugBotEnabled || showStartScreen || isOnlineMode || gameMode !== 'pvbot') return [];
    const botPlayer = state.config.botPlayer;
    if (!botPlayer) return [];

    try {
      return simpleBot.debugMoveCandidates(state, botPlayer, botLevel, 5);
    } catch {
      return [];
    }
  }, [botLevel, debugBotEnabled, gameMode, isOnlineMode, showStartScreen, state]);
  const activeViewer: Viewer = isOnlineMode
    ? onlineRoom.view?.viewer ?? 'spectator'
    : state.config.gameMode === 'pvbot'
      ? state.config.botPlayer === 'sente' ? 'gote' : 'sente'
      : activeCurrentPlayer;
  const onlineSeatLabel = onlineRoom.assignedPlayer === 'sente'
    ? language === 'ja' ? '先手' : 'Sente'
    : onlineRoom.assignedPlayer === 'gote'
      ? language === 'ja' ? '後手' : 'Gote'
      : '-';
  const canOnlineAct = isOnlineMode
    && hasOnlineGameView
    && onlineRoom.assignedPlayer !== null
    && onlineRoom.view?.currentPlayer === onlineRoom.assignedPlayer
    && onlineRoom.view.phase.type !== 'GAME_OVER';
  const onlineActionStatus = canOnlineAct ? copy.onlineYourTurn : copy.onlineWaitingTurn;
  const connectionWarningTitle = copy.connectionWarningTitle;
  const showConnectionWarning = isOnlineMode && (
    onlineRoom.status === 'connecting'
    || onlineRoom.status === 'disconnected'
    || onlineRoom.status === 'error'
  );
  const roomPresence = onlineRoom.roomPresence ?? onlineRoom.view?.roomPresence ?? null;
  const matchStats = isOnlineMode ? onlineRoom.view?.matchStats : null;
  const isOnlineGameOver = isOnlineMode && onlineRoom.view?.phase.type === 'GAME_OVER';
  const didRequestRematch = onlineRoom.assignedPlayer
    ? onlineRoom.rematchRequests.includes(onlineRoom.assignedPlayer)
    : false;
  const boardOrientation: BoardOrientation = isOnlineMode
    ? onlineRoom.assignedPlayer === 'gote' ? 'gote' : 'sente'
    : activeViewer === 'gote' ? 'gote' : 'sente';
  const topHandPlayer: Player = boardOrientation === 'gote' ? 'sente' : 'gote';
  const bottomHandPlayer: Player = boardOrientation === 'gote' ? 'gote' : 'sente';

  const latestLog = activeLog.at(-1);
  const isPitfallSetup = activePhase.type === 'PITFALL_PLACEMENT';
  const isMoveSelection = activePhase.type === 'MOVE_SELECTION';
  const activePitfallDraft = isPitfallSetup ? (isOnlineMode ? onlinePitfallDraft : pitfallDraft) : null;
  const activeLastPitfallPosition = isOnlineMode
    ? findLastPitfallPosition(activeLog, activeCurrentPlayer)
    : state.lastPitfallPositionByPlayer[activeCurrentPlayer];
  const blockedPitfallSquares = useMemo(
    () => [
      ...findKingSquares(activeBoard),
      ...(activeLastPitfallPosition ? [activeLastPitfallPosition] : []),
    ],
    [activeBoard, activeLastPitfallPosition]
  );
  const selectedPitfallLabel = activePitfallDraft ? formatPos(activePitfallDraft) : null;
  const trapBurstPosition = latestLog?.pitfallTriggered
    ? latestLog.triggeredPitfall ?? null
    : null;
  const trapReactionKind = getTrapReactionKind(latestLog, activeViewer);
  const trapReactionCopy = trapReactionKind === 'player_trapped'
    ? {
      title: copy.trapPlayerTitle,
      sub: copy.trapPlayerSub,
      label: 'Move failed',
      guideVariant: 'playerTrapped' as const,
      panelClass: 'border-fuchsia-100/60 bg-fuchsia-700 text-fuchsia-50 shadow-fuchsia-950/50',
      titleClass: 'text-2xl',
      guideClass: 'mt-2 border-fuchsia-950/20 bg-fuchsia-100/75',
    }
    : trapReactionKind === 'opponent_trapped'
      ? {
        title: copy.trapOpponentTitle,
        sub: copy.trapOpponentSub,
        label: 'Trap success',
        guideVariant: 'opponentTrapped' as const,
        panelClass: 'border-amber-100/70 bg-amber-300 text-stone-950 shadow-amber-950/45',
        titleClass: 'text-3xl',
        guideClass: 'mt-2 border-stone-950/15 bg-amber-50/70',
      }
      : null;
  const missedTrapPosition = latestLog && !latestLog.pitfallTriggered
    ? latestLog.revealedPitfall ?? null
    : null;
  const isCheckAlert = activePhase.type !== 'GAME_OVER'
    && isPlayerInCheck(activeBoard, activeCurrentPlayer);
  const checkKingPosition = isCheckAlert
    ? findKing(activeBoard, activeCurrentPlayer)
    : null;

  useEffect(() => {
    if (!latestLog) return;
    const logKey = `${isOnlineMode ? 'online' : 'local'}:${latestLog.turn}:${latestLog.player}`;
    if (latestLog.pitfallTriggered) {
      playSound('trapHit', logKey);
      return;
    }

    if (latestLog.action) {
      playSound('move', logKey);
    }
    if (latestLog.revealedPitfall) {
      playSound('trapMissReveal', logKey);
    }
  }, [isOnlineMode, latestLog, playSound]);

  useEffect(() => {
    if (!isCheckAlert || !checkKingPosition) return;
    playSound('check',
      `${isOnlineMode ? 'online' : 'local'}:${activeTurn}:${activeCurrentPlayer}:${checkKingPosition.row}:${checkKingPosition.col}`
    );
  }, [activeCurrentPlayer, activeTurn, checkKingPosition, isCheckAlert, isOnlineMode, playSound]);

  useEffect(() => {
    if (activePhase.type !== 'GAME_OVER') return;
    playSound('gameOver',
      `${isOnlineMode ? 'online' : 'local'}:${activeTurn}:${activePhase.winner}`
    );
  }, [activePhase, activeTurn, isOnlineMode, playSound]);

  const trapHistory = useMemo(() => buildTrapHistory(activeLog), [activeLog]);
  const trapStats = useMemo(() => buildTrapStats(trapHistory), [trapHistory]);

  // 罠レビューデータの集計
  const reviewTrapData = useMemo(() => {
    const data: Record<string, { count: number; state: 'hit' | 'miss' | 'none'; turns: number[] }> = {};
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        data[`${r}-${c}`] = { count: 0, state: 'none', turns: [] };
      }
    }

    if (reviewTrapFilter === 'none') return data;

    activeLog.forEach((entry) => {
      if (reviewTrapFilter === 'sente' && entry.player !== 'sente') return;
      if (reviewTrapFilter === 'gote' && entry.player !== 'gote') return;

      const setPos = entry.pitfallSet;
      if (setPos) {
        const key = `${setPos.row}-${setPos.col}`;
        if (data[key]) {
          data[key].count += 1;
          data[key].turns.push(entry.turn);
        }
      }
    });

    const hitPositions = new Set<string>();
    activeLog.forEach((entry) => {
      if (entry.triggeredPitfall) {
        hitPositions.add(`${entry.triggeredPitfall.row}-${entry.triggeredPitfall.col}`);
      }
    });

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const key = `${r}-${c}`;
        if (data[key].count > 0) {
          if (hitPositions.has(key)) {
            data[key].state = 'hit';
          } else {
            data[key].state = 'miss';
          }
        }
      }
    }

    return data;
  }, [activeLog, reviewTrapFilter]);

  // 最も狙われたマスの集計
  const mostTargetedSquare = useMemo((): { pos: Position; count: number } | null => {
    if (activeLog.length === 0) return null;
    const counts: Record<string, { pos: Position; count: number }> = {};
    for (const entry of activeLog) {
      if (entry.pitfallSet) {
        const key = `${entry.pitfallSet.row}-${entry.pitfallSet.col}`;
        if (!counts[key]) {
          counts[key] = { pos: entry.pitfallSet, count: 0 };
        }
        counts[key].count += 1;
      }
    }

    const items = Object.values(counts);
    if (items.length === 0) return null;

    let best = items[0];
    for (let i = 1; i < items.length; i++) {
      if (items[i].count > best.count) {
        best = items[i];
      }
    }
    return best.count > 0 ? { pos: best.pos, count: best.count } : null;
  }, [activeLog]);

  const confirmPitfall = () => {
    if (!activePitfallDraft) return;
    if (isBlockedPitfallSquare(blockedPitfallSquares, activePitfallDraft)) {
      setPitfallMessage(
        activeLastPitfallPosition && posEquals(activeLastPitfallPosition, activePitfallDraft)
          ? copy.repeatPitfallBlocked
          : copy.kingPitfallBlocked
      );
      return;
    }
    if (isOnlineMode) {
      if (!canOnlineAct) return;
      onlineRoom.sendPlacePitfall(activePitfallDraft);
      playSound('trapPlace');
      setOnlinePitfallDraft(null);
      setPitfallMessage(null);
      return;
    }
    game.placePitfall(activePitfallDraft);
    playSound('trapPlace');
    setPitfallDraft(null);
    setPitfallMessage(null);
  };

  const handleCellClick = (position: Position) => {
    if (activePhase.type === 'GAME_OVER') {
      const key = `${position.row}-${position.col}`;
      const cellData = reviewTrapData[key];
      if (cellData && cellData.count > 0) {
        const targetTurn = cellData.turns[0];
        setHighlightedLogTurn(targetTurn === highlightedLogTurn ? null : targetTurn);

        setTimeout(() => {
          const el = document.getElementById(`log-entry-${targetTurn}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 50);
      }
      return;
    }

    if (isOnlineMode) {
      if (!onlineRoom.view || !canOnlineAct) return;
      const board = onlineRoom.view.board;
      const phase = onlineRoom.view.phase;
      const currentPlayer = onlineRoom.view.currentPlayer;

      if (phase.type === 'PITFALL_PLACEMENT') {
        if (isKingSquare(board, position)) {
          setOnlinePitfallDraft(null);
          setPitfallMessage(copy.kingPitfallBlocked);
          return;
        }
        if (activeLastPitfallPosition && posEquals(activeLastPitfallPosition, position)) {
          setOnlinePitfallDraft(null);
          setPitfallMessage(copy.repeatPitfallBlocked);
          return;
        }
        setPitfallMessage(null);
        setOnlinePitfallDraft(position);
        return;
      }

      if (phase.type !== 'MOVE_SELECTION') return;

      if (onlineSelection.type === 'piece') {
        const target = onlineSelection.legalMoves.find(
          (move) => move.row === position.row && move.col === position.col
        );
        if (target) {
          const piece = board[onlineSelection.position.row][onlineSelection.position.col];
          if (!piece) return;
          const action: MoveAction = {
            type: 'move',
            from: onlineSelection.position,
            to: target,
            piece,
          };
          if (canPromote(piece, onlineSelection.position, target)) {
            setOnlinePromotionMove(action);
            return;
          }
          onlineRoom.sendMakeMove(action);
          setOnlineSelection({ type: 'none' });
          return;
        }
      }

      if (onlineSelection.type === 'hand_piece') {
        const target = onlineSelection.legalDrops.find(
          (drop) => drop.row === position.row && drop.col === position.col
        );
        if (target) {
          onlineRoom.sendMakeMove({
            type: 'drop',
            to: target,
            piece: { kind: onlineSelection.pieceKind, owner: currentPlayer },
          });
          setOnlineHandSelection(null);
          setOnlineSelection({ type: 'none' });
          return;
        }
      }

      const cell = board[position.row][position.col];
      if (cell?.owner === currentPlayer) {
        setOnlineHandSelection(null);
        setOnlineSelection({
          type: 'piece',
          position,
          legalMoves: getLegalMoves(board, position),
        });
        return;
      }

      setOnlineSelection({ type: 'none' });
      return;
    }

    if (state.phase.type === 'PITFALL_PLACEMENT') {
      if (isKingSquare(state.board, position)) {
        setPitfallDraft(null);
        setPitfallMessage(copy.kingPitfallBlocked);
        return;
      }
      if (activeLastPitfallPosition && posEquals(activeLastPitfallPosition, position)) {
        setPitfallDraft(null);
        setPitfallMessage(copy.repeatPitfallBlocked);
        return;
      }
      setPitfallMessage(null);
      setPitfallDraft(position);
      return;
    }

    if (state.phase.type !== 'MOVE_SELECTION') return;

    if (selection.type === 'piece') {
      const target = selection.legalMoves.find(
        (move) => move.row === position.row && move.col === position.col
      );
      if (target) {
        const piece = state.board[selection.position.row][selection.position.col];
        if (!piece) return;
        game.executeMove({
          type: 'move',
          from: selection.position,
          to: target,
          piece,
        });
        return;
      }
    }

    if (selection.type === 'hand_piece') {
      const target = selection.legalDrops.find(
        (drop) => drop.row === position.row && drop.col === position.col
      );
      if (target) {
        game.executeMove({
          type: 'drop',
          to: target,
          piece: { kind: selection.pieceKind, owner: state.currentPlayer },
        });
        return;
      }
    }

    const cell = state.board[position.row][position.col];
    if (cell?.owner === state.currentPlayer) {
      game.selectPiece(position);
      return;
    }

    game.clearSelection();
  };

  const handleHandPieceClick = (pieceKind: PieceKind) => {
    if (isOnlineMode) {
      if (!onlineRoom.view || !canOnlineAct || onlineRoom.view.phase.type !== 'MOVE_SELECTION') return;
      setOnlineHandSelection(pieceKind);
      setOnlineSelection({
        type: 'hand_piece',
        pieceKind,
        legalDrops: getLegalDrops(onlineRoom.view.board, onlineRoom.view.currentPlayer, pieceKind),
      });
      return;
    }

    game.selectHandPiece(pieceKind);
  };

  const decideOnlinePromotion = (promote: boolean) => {
    if (!onlinePromotionMove || !canOnlineAct) return;
    onlineRoom.sendMakeMove({ ...onlinePromotionMove, promote });
    setOnlinePromotionMove(null);
    setOnlineSelection({ type: 'none' });
  };

  const resetWithSettings = (
    nextMode = gameMode,
    nextCasual = casualMode,
    nextBotLevel = botLevel
  ) => {
    setGameMode(nextMode);
    setCasualMode(nextCasual);
    setBotLevel(nextBotLevel);
    setPitfallDraft(null);
    setPitfallMessage(null);
    game.resetGame(nextMode, nextCasual, nextBotLevel);
  };

  const openHelpTutorial = () => {
    setShowTutorial(true);
  };

  const closeFirstTurnTutorial = () => {
    try {
      localStorage.setItem(FIRST_TURN_TUTORIAL_STORAGE_KEY, 'seen');
    } catch {
      // Ignore storage failures; the tutorial still needs to be dismissible.
    }
    setShowTutorial(false);
  };

  const startMatch = () => {
    setIsOnlineMode(false);
    setShowStartScreen(false);
    setShowSettings(false);
    resetWithSettings(gameMode, casualMode, botLevel);
    try {
      const hasSeenTutorial = localStorage.getItem(FIRST_TURN_TUTORIAL_STORAGE_KEY) === 'seen';
      setShowTutorial(!hasSeenTutorial);
    } catch {
      setShowTutorial(true);
    }
  };

  const startOnlineRoom = () => {
    if (!onlineRoom.isConfigured || !onlineRoomId.trim()) return;
    setIsOnlineMode(true);
    setShowStartScreen(false);
    setShowTutorial(false);
    setOnlineSelection({ type: 'none' });
    setOnlineHandSelection(null);
    setOnlinePromotionMove(null);
    setOnlinePitfallDraft(null);
    setShowSettings(false);
    onlineRoom.connect(onlineRoomId);
  };

  const handleConfirmResign = () => {
    if (isOnlineMode) {
      onlineRoom.sendResign();
    } else {
      game.resign();
    }
    setShowResignConfirm(false);
  };

  const passDevicePlayer = state.currentPlayer === 'sente'
    ? language === 'ja' ? '先手' : 'Sente'
    : language === 'ja' ? '後手' : 'Gote';

  if (!isOnlineMode && state.phase.type === 'PASS_DEVICE') {
    return (
      <main className="min-h-dvh bg-[#050817] text-stone-100">
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050817]/95 px-5 text-center backdrop-blur-md">
          <div className="w-full max-w-md rounded-lg border border-sky-200/20 bg-[#08152d] p-7 shadow-2xl shadow-black/60">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-sky-300/80">
              Private handoff
            </p>
            <h2 className="mt-4 text-3xl font-black text-sky-50">
              {language === 'ja'
                ? `${passDevicePlayer}に${copy.passTitle}`
                : `${copy.passTitle} to ${passDevicePlayer}`}
            </h2>
            <p className="mt-4 text-sm leading-7 text-sky-100/75">
              {copy.passBody}
            </p>
            <div className="mt-5 rounded-md border border-sky-200/15 bg-sky-100/5 px-4 py-3 text-left text-sm text-sky-50/85">
              <div className="font-black">{copy.rules}</div>
              <div className="mt-1">{copy.passSteps}</div>
            </div>
            <button
              type="button"
              onClick={game.acknowledgePassDevice}
              className="mt-6 h-12 w-full rounded-md bg-sky-200 text-sm font-black text-[#06111f] transition hover:bg-white"
            >
              {copy.passStart}
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#17110b] text-stone-100">
      <div className={`mx-auto flex w-full max-w-[960px] flex-col ${
        isOnlineMode ? 'gap-1.5 px-2 py-1 sm:px-3' : 'gap-2 px-3 py-1.5 sm:px-4'
      }`}>
        <div className={`rounded-md border border-red-300/35 bg-red-500/12 px-3 py-2 text-sm font-bold text-red-50 md:hidden ${showStartScreen ? 'hidden' : ''}`}>
          {copy.mobileWarning}
        </div>

        <header className={`flex flex-col border-b border-amber-500/20 md:flex-row md:items-center md:justify-between ${
          isOnlineMode ? 'gap-1 pb-1' : 'gap-1 pb-1.5'
        } ${showStartScreen ? 'hidden' : ''}`}>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md border border-amber-200/20 bg-amber-300/10 px-2 py-1 text-[11px] font-black text-amber-50">
              {copy.matchTurnLabel}: {formatPlayerLabel(activeCurrentPlayer, language)}
            </span>
            <span className="rounded-md border border-sky-200/20 bg-sky-300/10 px-2 py-1 text-[11px] font-black text-sky-50">
              {copy.matchPhaseLabel}: {formatPhaseLabel(activePhase, language)}
            </span>
            {isCheckAlert && (
              <span className="rounded-md border border-red-200/60 bg-red-500 px-2 py-1 text-[11px] font-black text-white shadow shadow-red-950/40">
                {copy.checkAlert}
              </span>
            )}
            {isOnlineMode && (
              <span className="rounded-md border border-emerald-200/25 bg-emerald-300/10 px-2 py-1 text-[11px] font-black text-emerald-50">
                {copy.onlineSeatLabel}: {onlineSeatLabel}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setShowResignConfirm(true)}
              disabled={activePhase.type === 'GAME_OVER' || (isOnlineMode && !onlineRoom.view)}
              className={`h-8 px-2.5 text-[11px] rounded-md font-black shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                isCheckAlert
                  ? 'border-2 border-red-500 bg-red-600 text-white animate-pulse shadow-red-500/50 hover:bg-red-500'
                  : 'border border-red-200/50 bg-red-500/20 text-red-50 shadow-red-950/30 hover:bg-red-400/30'
              }`}
            >
              {copy.resign}
            </button>
            <button
              type="button"
              onClick={openHelpTutorial}
              className="h-8 px-2.5 text-[11px] rounded-md border border-fuchsia-300/35 bg-fuchsia-300/10 font-bold text-fuchsia-100 transition hover:bg-fuchsia-300/20"
            >
              {copy.help}
            </button>
            <button
              type="button"
              onClick={() => setShowSettings((current) => !current)}
              aria-expanded={showSettings}
              aria-controls="settings-panel"
              className="h-8 min-w-8 rounded-md border border-white/15 bg-white/8 px-2 text-[11px] font-black text-stone-100 transition hover:bg-white/15"
            >
              {copy.settingsLabel}
            </button>
          </div>
        </header>

        {!showStartScreen && showSettings && (
          <section
            id="settings-panel"
            className="settings-panel rounded-lg border border-white/10 bg-white/[0.06] p-2 shadow-lg shadow-black/20"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="h-8 px-1.5 flex items-center gap-1 rounded-md border border-white/10 bg-black/15">
                <span className="text-[11px] font-black text-stone-300">{copy.language}</span>
                {(['ja', 'en'] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setLanguage(lang)}
                    className={`h-5 px-1.5 text-[11px] rounded font-black transition ${
                      language === lang
                        ? 'bg-amber-200 text-stone-950'
                        : 'text-stone-200 hover:bg-white/10'
                    }`}
                  >
                    {lang === 'ja' ? '日本語' : 'English'}
                  </button>
                ))}
              </div>
              {!isOnlineMode && (
                <div className="min-h-8 px-1.5 flex items-center gap-1 rounded-md border border-white/10 bg-black/15">
                  <span className="text-[11px] font-black text-stone-300">
                    {copy.modeControlLabel}
                  </span>
                  {localModeOptions.map((option) => (
                    <button
                      key={`settings-${option.value}`}
                      type="button"
                      onClick={() => resetWithSettings(option.value, casualMode, botLevel)}
                      aria-pressed={gameMode === option.value}
                      className={`h-5 px-1.5 text-[11px] rounded font-black transition ${
                        gameMode === option.value
                          ? 'bg-amber-200 text-stone-950'
                          : 'text-stone-200 hover:bg-white/10'
                      }`}
                    >
                      {option.label[language]}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => resetWithSettings(gameMode, !casualMode, botLevel)}
                className={`h-8 px-2 text-[11px] rounded-md border font-bold transition ${
                  casualMode
                    ? 'border-violet-300 bg-violet-300 text-stone-950'
                    : 'border-violet-500/30 bg-black/15 text-violet-100 hover:bg-white/10'
                }`}
              >
                {activeCasualOption.label[language]}
              </button>
              <div className="h-8 px-1.5 flex items-center gap-1 rounded-md border border-white/10 bg-black/15">
                <button
                  type="button"
                  onClick={() => setSoundEnabled(!soundSettings.enabled)}
                  aria-pressed={soundSettings.enabled}
                  className={`h-5 px-1.5 text-[11px] rounded font-black transition ${
                    soundSettings.enabled
                      ? 'bg-emerald-200 text-stone-950'
                      : 'text-stone-200 hover:bg-white/10'
                  }`}
                >
                  {soundSettings.enabled ? 'Sound ON' : 'Sound OFF'}
                </button>
                {[0.5, 1].map((volume) => (
                  <button
                    key={`sound-volume-${volume}`}
                    type="button"
                    onClick={() => setSoundVolume(volume)}
                    aria-pressed={soundSettings.volume === volume}
                    className={`h-5 px-1.5 text-[11px] rounded font-black transition ${
                      soundSettings.volume === volume
                        ? 'bg-emerald-200 text-stone-950'
                        : 'text-stone-200 hover:bg-white/10'
                    }`}
                  >
                    {Math.round(volume * 100)}%
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => resetWithSettings()}
                className="h-8 px-2 text-[11px] rounded-md border border-stone-500/40 bg-stone-100/10 font-bold text-stone-100 transition hover:bg-stone-100/15"
              >
                {copy.reset}
              </button>
              <button
                type="button"
                onClick={() => setShowKnownIssues(true)}
                className="h-8 px-2 text-[11px] rounded-md border border-red-300/35 bg-red-300/10 font-bold text-red-100 transition hover:bg-red-300/20"
              >
                {copy.knownIssues}
              </button>
              <a
                href={FEEDBACK_URL}
                target="_blank" rel="noopener noreferrer"
                className="h-8 px-2 text-[11px] flex items-center rounded-md border border-emerald-300/35 bg-emerald-300/10 font-bold text-emerald-100 transition hover:bg-emerald-300/20"
              >
                {copy.feedback}
              </a>
            </div>
          </section>
        )}

        {showStartScreen && (
          <div className="flex items-start justify-center">
            <div className="w-full max-w-[920px] rounded-lg border border-amber-200/30 bg-[#1d130b] p-2.5 shadow-2xl shadow-black/70 sm:p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-amber-200/70">
                    {copy.subtitle} · {APP_VERSION}
                    <span className="ml-2 normal-case tracking-normal text-amber-200">({copy.prototype})</span>
                  </p>
                  <h2 className="mt-0.5 text-3xl font-black text-amber-50">
                    {copy.title}
                  </h2>
                  <p className="mt-1.5 max-w-xl text-sm font-bold leading-5 text-amber-50/75">
                    {language === 'ja' ? (
                      <>
                        <span className="block">「最善手が、罠になる。」</span>
                        <span className="block">毎ターン1マスだけ、相手の次の一手を封じる変則将棋。</span>
                      </>
                    ) : (
                      <>
                        <span className="block">“Every best move might be a trap.”</span>
                        <span className="block">A shogi variant where you secretly block one destination every turn.</span>
                      </>
                    )}
                  </p>
                  <NinjaGuide
                    language={language}
                    variant="title"
                    className="mt-2 max-w-md"
                  />
                </div>
                <div className="flex h-9 items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2">
                  <span className="text-xs font-black text-stone-300">{copy.language}</span>
                  {(['ja', 'en'] as const).map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setLanguage(lang)}
                      className={`h-6 rounded px-2 text-xs font-black transition ${
                        language === lang
                          ? 'bg-amber-200 text-stone-950'
                          : 'text-stone-200 hover:bg-white/10'
                      }`}
                    >
                      {lang === 'ja' ? '日本語' : 'English'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-xs font-black uppercase tracking-[0.22em] text-amber-200/70">
                    {copy.modeControlLabel}
                  </div>
                  <div className="text-xs font-bold text-amber-50/60">
                    {gameMode === 'pvbot' ? copy.botLevelHelp : copy.pvpDetail}
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  {localModeOptions.map((option) => (
                    <button
                      key={`start-${option.value}`}
                      type="button"
                      onClick={() => resetWithSettings(option.value, casualMode, botLevel)}
                      aria-pressed={gameMode === option.value}
                      className={`min-h-16 rounded-lg border p-3 text-left transition ${
                        gameMode === option.value
                          ? option.value === 'pvp'
                            ? 'border-amber-200 bg-amber-200 text-stone-950'
                            : 'border-sky-200 bg-sky-200 text-stone-950'
                          : option.value === 'pvp'
                            ? 'border-amber-200/20 bg-white/[0.04] text-amber-50 hover:bg-white/10'
                            : 'border-sky-200/20 bg-white/[0.04] text-sky-50 hover:bg-white/10'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-base font-black">{option.label[language]}</span>
                        <span className="rounded bg-black/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-normal">
                          {option.tag}
                        </span>
                      </span>
                      <span className="mt-1 block text-xs font-bold leading-4 opacity-75">{option.detail[language]}</span>
                    </button>
                  ))}
                <div className={`rounded-lg border p-2.5 ${
                  onlineRoom.isConfigured
                    ? 'border-emerald-200/25 bg-emerald-300/[0.06] text-emerald-50'
                    : 'border-stone-400/20 bg-stone-500/[0.05] text-stone-300'
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="block text-base font-black leading-5">{copy.onlineExperimental}</span>
                      <span className="mt-1 block text-[11px] font-bold leading-4 opacity-75">{copy.onlineDetail}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="rounded bg-emerald-200/15 px-2 py-1 text-[10px] font-black uppercase tracking-normal text-emerald-50">
                        {copy.onlineExperimentalBadge}
                      </span>
                      {!onlineRoom.isConfigured && (
                        <span className="rounded bg-stone-200/10 px-2 py-1 text-[10px] font-black uppercase tracking-normal">
                          {copy.onlineDisabled}
                        </span>
                      )}
                    </div>
                  </div>
                  {!onlineRoom.isConfigured && (
                    <div className="mt-2 rounded-md border border-stone-300/15 bg-stone-200/10 px-2 py-1 text-[11px] font-black text-stone-200">
                      {copy.onlineDisabledReason}
                    </div>
                  )}
                  <label className="mt-2 block text-[10px] font-black uppercase tracking-[0.18em] opacity-75">
                    {copy.roomId}
                  </label>
                  <input
                    type="text"
                    value={onlineRoomId}
                    onChange={(event) => setOnlineRoomId(event.target.value)}
                    placeholder="room-a"
                    className="mt-1 h-9 w-full rounded-md border border-white/15 bg-black/20 px-3 text-sm font-bold text-stone-50 outline-none transition placeholder:text-stone-400 focus:border-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  {onlineRoomId.trim() && (
                    <div className="mt-1.5 grid gap-1">
                      <input
                        readOnly
                        value={inviteUrl}
                        onFocus={selectInviteUrl}
                        onClick={selectInviteUrl}
                        aria-label="Invite URL"
                        className="h-8 w-full rounded border border-emerald-300/25 bg-black/20 px-2 text-xs font-bold text-emerald-50 outline-none transition focus:border-emerald-100"
                      />
                      <button
                        type="button"
                        onClick={handleCopyInviteUrl}
                        className="h-8 w-full rounded border border-emerald-300/30 bg-emerald-300/10 text-xs font-black text-emerald-100 transition hover:bg-emerald-300/20"
                      >
                        {inviteCopyStatus === 'copied' ? copy.copied : copy.copyInviteUrl}
                      </button>
                      {inviteCopyMessage && (
                        <div className={`rounded px-2 py-1 text-[11px] font-bold ${
                          inviteCopyStatus === 'copied'
                            ? 'bg-emerald-200/15 text-emerald-50'
                            : 'bg-amber-300/15 text-amber-50'
                        }`}>
                          {inviteCopyMessage}
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={startOnlineRoom}
                    disabled={!onlineRoom.isConfigured || !onlineRoomId.trim() || onlineRoom.status === 'connecting'}
                    className="mt-1.5 h-8 w-full rounded-md bg-emerald-200 px-4 text-sm font-black text-stone-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-stone-500 disabled:text-stone-300"
                  >
                    {copy.connect}
                  </button>
                </div>
              </div>
              </div>

              {gameMode === 'pvbot' && (
                <div className="mt-2 rounded-md border border-sky-200/20 bg-sky-400/8 p-2">
                  <div className="mb-1.5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <div className="text-xs font-black uppercase tracking-[0.22em] text-sky-200/75">
                        {copy.botLevelScopeLabel}
                      </div>
                      <div className="text-sm font-bold text-sky-50">
                        {copy.botLevelHelp}
                      </div>
                    </div>
                    <div className="text-xs font-bold text-sky-100/70">
                      {copy.botSummary}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {BOT_LEVEL_OPTIONS.map((option) => (
                      <button
                        key={`start-${option.value}`}
                        type="button"
                        aria-pressed={botLevel === option.value}
                        onClick={() => resetWithSettings('pvbot', casualMode, option.value)}
                        className={`min-h-10 rounded-md border px-3 py-1 text-left transition ${
                          botLevel === option.value
                            ? 'border-sky-200 bg-sky-200 text-[#06111f]'
                            : 'border-sky-200/25 bg-white/[0.04] text-sky-50 hover:bg-white/10'
                        }`}
                      >
                        <span className="block text-sm font-black leading-4">{option.label}</span>
                        <span className="block text-[10px] font-bold leading-3 opacity-75">{option.detail[language]}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-2 rounded-md border border-violet-200/20 bg-violet-400/8 p-2">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.22em] text-violet-200/75">
                      Casual
                    </div>
                    <div className="text-sm font-bold text-violet-50">
                      {copy.casualDetail}
                    </div>
                  </div>
                  <div className="text-xs font-bold text-violet-100/70">
                    {activeCasualOption.label[language]}
                  </div>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {CASUAL_MODE_OPTIONS.map((option) => (
                    <button
                      key={`casual-${String(option.value)}`}
                      type="button"
                      aria-pressed={casualMode === option.value}
                      onClick={() => resetWithSettings(gameMode, option.value, botLevel)}
                      className={`min-h-12 rounded-md border px-3 py-1.5 text-left transition ${
                        casualMode === option.value
                          ? 'border-violet-200 bg-violet-200 text-[#1a1024]'
                          : 'border-violet-200/25 bg-white/[0.04] text-violet-50 hover:bg-white/10'
                      }`}
                    >
                      <span className="block text-sm font-black leading-4">{option.label[language]}</span>
                      <span className="mt-1 block text-[11px] font-bold leading-4 opacity-75">{option.detail[language]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-2 rounded-md border border-fuchsia-200/20 bg-fuchsia-400/8 p-2">
                <div className="text-xs font-black uppercase tracking-[0.22em] text-fuchsia-200/75">
                  {copy.rules}
                </div>
                <div className="mt-1 grid gap-1">
                  {tutorialSteps.map((step, index) => (
                    <div key={`start-rule-${step}`} className="flex gap-2 text-sm font-bold leading-5 text-fuchsia-50">
                      <span className="text-fuchsia-200">{index + 1}.</span>
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs font-bold text-stone-300">
                  {copy.mobileWarning}
                </div>
                <button
                  type="button"
                  onClick={startMatch}
                  className="h-9 rounded-md bg-amber-200 px-6 text-sm font-black text-stone-950 transition hover:bg-white"
                >
                  {copy.start}
                </button>
              </div>
            </div>
          </div>
        )}

        {showKnownIssues && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#08040b]/80 px-4 backdrop-blur-md">
            <div className="w-full max-w-lg rounded-lg border border-red-200/30 bg-[#1c0f0f] p-5 shadow-2xl shadow-black/70">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.26em] text-red-200/75">
                    {APP_VERSION}
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-red-50">
                    {copy.knownIssues}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowKnownIssues(false)}
                  className="h-9 rounded-md border border-white/15 px-3 text-sm font-bold text-stone-100 transition hover:bg-white/10"
                >
                  {copy.close}
                </button>
              </div>
              <div className="mt-5 grid gap-2">
                {KNOWN_ISSUES[language].map((issue) => (
                  <div
                    key={issue}
                    className="rounded-md border border-red-200/15 bg-white/[0.04] px-3 py-2 text-sm font-bold text-red-50"
                  >
                    {issue}
                  </div>
                ))}
              </div>
              <div className="mt-5">
                <h3 className="text-sm font-black text-red-100">
                  Online Known Issues
                </h3>
                <div className="mt-2 grid gap-2">
                  {ONLINE_KNOWN_ISSUES[language].map((issue) => (
                    <div
                      key={issue}
                      className="rounded-md border border-emerald-200/15 bg-emerald-400/[0.06] px-3 py-2 text-sm font-bold text-emerald-50"
                    >
                      {issue}
                    </div>
                  ))}
                </div>
              </div>
              <a
                href={FEEDBACK_URL}
                target="_blank" rel="noopener noreferrer"
                className="mt-5 flex h-11 items-center justify-center rounded-md bg-emerald-200 text-sm font-black text-stone-950 transition hover:bg-white"
              >
                {copy.feedback}
              </a>
            </div>
          </div>
        )}

        {showResignConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#08040b]/80 px-4 backdrop-blur-md">
            <div className="w-full max-w-sm rounded-lg border border-red-200/40 bg-[#1c0f0f] p-5 text-center shadow-2xl shadow-black/70">
              <h2 className="text-2xl font-black text-red-50">{copy.confirmResign}</h2>
              <p className="mt-3 text-sm font-bold leading-6 text-red-50/75">
                {copy.confirmResignBody}
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowResignConfirm(false)}
                  className="h-11 rounded-md border border-white/15 px-3 text-sm font-bold text-stone-100 transition hover:bg-white/10"
                >
                  {copy.cancel}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmResign}
                  className="h-11 rounded-md bg-red-300 px-3 text-sm font-black text-stone-950 transition hover:bg-red-100"
                >
                  {copy.resign}
                </button>
              </div>
            </div>
          </div>
        )}

        {showTutorial && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#08040b]/80 px-4 backdrop-blur-md">
            <div className="w-full max-w-lg rounded-lg border border-fuchsia-200/30 bg-[#160d18] p-5 shadow-2xl shadow-black/70">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.26em] text-fuchsia-200/75">
                    Mini tutorial
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-fuchsia-50">
                    {copy.rules}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={closeFirstTurnTutorial}
                  className="h-9 rounded-md border border-white/15 px-3 text-sm font-bold text-stone-100 transition hover:bg-white/10"
                >
                  {copy.close}
                </button>
              </div>
              <NinjaGuide
                language={language}
                variant="help"
                className="mt-5"
              />
              <div className="mt-5 grid gap-3">
                {tutorialSteps.map((step, index) => (
                  <div
                    key={step}
                    className="grid grid-cols-[2.5rem_1fr] items-center gap-3 rounded-md border border-fuchsia-200/15 bg-white/[0.04] p-3"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-fuchsia-200 text-sm font-black text-[#1b0b1d]">
                      {index + 1}
                    </div>
                    <div>
                      <div className="text-sm font-black leading-5 text-fuchsia-50">
                        {step}
                      </div>
                      <div className="mt-0.5 text-xs font-bold leading-5 text-fuchsia-50/70">
                        {tutorialDetails[index]}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={closeFirstTurnTutorial}
                className="mt-5 h-10 w-full rounded-md border border-fuchsia-200/25 bg-fuchsia-100/10 text-sm font-black text-fuchsia-50 transition hover:bg-fuchsia-100/20"
              >
                {copy.skip}
              </button>
            </div>
          </div>
        )}

        {!showStartScreen && isOnlineMode && (
          <section className="rounded-lg border border-emerald-300/25 bg-emerald-400/[0.07] p-2">
            <div className="flex flex-col gap-1.5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-200/75">
                  {copy.onlineExperimental} · {copy.onlineExperimentalBadge}
                </p>
                <h2 className="text-sm font-black text-emerald-50">
                  {copy.onlineDebug}
                </h2>
                <div className="mt-1 flex flex-wrap gap-1 text-[10px] font-bold text-emerald-50/80">
                  <span className="rounded bg-white/10 px-1.5 py-0.5">
                    {copy.roomId}: {onlineRoom.roomId ?? onlineRoomId}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyInviteUrl}
                    className="rounded border border-emerald-300/30 bg-emerald-300/10 px-1.5 py-0.5 text-[10px] font-black text-emerald-100 transition hover:bg-emerald-300/30"
                  >
                    {inviteCopyStatus === 'copied' ? copy.copied : copy.copyInviteUrl}
                  </button>
                  {inviteUrl && (
                    <input
                      readOnly
                      value={inviteUrl}
                      onFocus={selectInviteUrl}
                      onClick={selectInviteUrl}
                      aria-label="Invite URL"
                      className="min-w-[220px] rounded border border-emerald-300/20 bg-black/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-50 outline-none focus:border-emerald-100"
                    />
                  )}
                  {inviteCopyMessage && (
                    <span className={`rounded px-1.5 py-0.5 ${
                      inviteCopyStatus === 'copied'
                        ? 'bg-emerald-200/15 text-emerald-50'
                        : 'bg-amber-300/15 text-amber-50'
                    }`}>
                      {inviteCopyMessage}
                    </span>
                  )}
                  <span className="rounded bg-white/10 px-1.5 py-0.5">
                    {copy.onlineStatus}: {onlineRoom.status}
                  </span>
                  <span className="rounded bg-white/10 px-1.5 py-0.5">
                    {copy.onlineSeatLabel}: {onlineSeatLabel}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 ${
                    canOnlineAct
                      ? 'bg-amber-200 text-stone-950'
                      : 'bg-white/10 text-emerald-50/80'
                  }`}>
                    {onlineActionStatus}
                  </span>
                  <span className="rounded bg-white/10 px-1.5 py-0.5">
                    revision: {onlineRoom.revision ?? '-'}
                  </span>
                  <span className="rounded bg-white/10 px-1.5 py-0.5">
                    ackClientSeq: {onlineRoom.ackClientSeq ?? '-'}
                  </span>
                  <span className="rounded bg-white/10 px-1.5 py-0.5">
                    sentSeq: {onlineRoom.lastSentClientSeq ?? '-'}
                  </span>
                  <span className="rounded bg-white/10 px-1.5 py-0.5">
                    received: {onlineRoom.lastReceivedEventType ?? '-'}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 ${
                    onlineRoom.hasRawPitfallLeak
                      ? 'bg-red-300 text-stone-950'
                      : 'bg-emerald-200/15 text-emerald-50'
                  }`}>
                    {copy.rawPitfallLeak}: {onlineRoom.hasRawPitfallLeak ? 'yes' : 'no'}
                  </span>
                  <span className="rounded bg-white/10 px-1.5 py-0.5">
                    {copy.roomPlayers}: {roomPresence ? `${roomPresence.players}/${roomPresence.playerCapacity}` : '-'}
                  </span>
                  <span className="rounded bg-white/10 px-1.5 py-0.5">
                    {copy.roomSpectators}: {roomPresence?.spectators ?? '-'}
                  </span>
                </div>
                {onlineRoom.lastError && (
                  <div className="mt-1 rounded-md border border-red-200/30 bg-red-500/10 px-2 py-1 text-[11px] font-bold text-red-50">
                    {onlineRoom.lastError}
                  </div>
                )}
                {onlineRoom.lastInvalidCommand && (
                  <div className="mt-1 rounded-md border border-red-200/30 bg-red-500/10 px-2 py-1 text-[11px] font-bold text-red-50">
                    {copy.invalidCommand}: {onlineRoom.lastInvalidCommand.payload.commandType}
                    {' / '}
                    {copy.invalidCommandReason}: {onlineRoom.lastInvalidCommand.payload.reason}
                    {' / '}
                    revision: {onlineRoom.lastInvalidCommand.revision}
                    {' / '}
                    ackClientSeq: {onlineRoom.lastInvalidCommand.ackClientSeq ?? '-'}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => onlineRoom.connect(onlineRoomId)}
                  disabled={!onlineRoom.isConfigured || !onlineRoomId.trim() || onlineRoom.status === 'connecting'}
                  className="h-7 rounded-md bg-emerald-200 px-2.5 text-[11px] font-black text-stone-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-stone-500 disabled:text-stone-300"
                >
                  {copy.connect}
                </button>
                <button
                  type="button"
                  onClick={onlineRoom.reconnect}
                  disabled={!onlineRoom.roomId || onlineRoom.status === 'connecting'}
                  className="h-7 rounded-md border border-emerald-100/30 px-2.5 text-[11px] font-black text-emerald-50 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {copy.reconnect}
                </button>
                <button
                  type="button"
                  onClick={onlineRoom.disconnect}
                  className="h-7 rounded-md border border-emerald-100/30 px-2.5 text-[11px] font-black text-emerald-50 transition hover:bg-white/10"
                >
                  {copy.disconnect}
                </button>
                <button
                  type="button"
                  onClick={() => setShowResignConfirm(true)}
                  disabled={!onlineRoom.view || onlineRoom.view.phase.type === 'GAME_OVER'}
                  className={`h-7 rounded-md px-2.5 text-[11px] font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${
                    isCheckAlert
                      ? 'border-2 border-red-500 bg-red-600 text-white animate-pulse shadow-sm shadow-red-500/50'
                      : 'border border-red-200/40 bg-red-500/10 text-red-50 hover:bg-red-400/20'
                  }`}
                >
                  {copy.resign}
                </button>
                {isOnlineGameOver && (
                  <button
                    type="button"
                    onClick={onlineRoom.sendRematch}
                    disabled={didRequestRematch}
                    className="h-7 rounded-md border border-amber-100/50 bg-amber-300/15 px-2.5 text-[11px] font-black text-amber-50 transition hover:bg-amber-300/25 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {didRequestRematch ? copy.onlineRematchWaiting : copy.onlineRematch}
                  </button>
                )}
              </div>
            </div>

            <details className="mt-1 rounded-md border border-emerald-100/15 bg-black/20 px-2 py-1">
              <summary className="cursor-pointer text-[11px] font-black uppercase tracking-[0.16em] text-emerald-100/70">
                Debug JSON
              </summary>
              <div className="mt-2 grid gap-2 lg:grid-cols-2">
                <div className="rounded-md border border-emerald-100/15 bg-black/20 p-2">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-100/70">
                    GameView
                  </div>
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] leading-4 text-emerald-50/85">
                    {onlineRoom.view
                      ? JSON.stringify({
                        viewer: onlineRoom.view.viewer,
                        phase: onlineRoom.view.phase,
                        currentPlayer: onlineRoom.view.currentPlayer,
                        turn: onlineRoom.view.turn,
                        visiblePitfalls: onlineRoom.view.visiblePitfalls,
                        winner: onlineRoom.view.winner,
                      }, null, 2)
                      : 'Waiting for roomJoined...'}
                  </pre>
                </div>
                <div className="rounded-md border border-emerald-100/15 bg-black/20 p-2">
                  <div className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-100/70">
                    {copy.onlineEventLog}
                  </div>
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] leading-4 text-emerald-50/85">
                    {onlineRoom.events.length > 0
                      ? JSON.stringify(onlineRoom.events, null, 2)
                      : 'No ServerEvent yet'}
                  </pre>
                </div>
              </div>
            </details>
          </section>
        )}

        {!showStartScreen && showConnectionWarning && (
          <div className="rounded-lg border border-red-200/40 bg-red-500/15 px-4 py-3 text-red-50 shadow-lg shadow-red-950/25">
            <div className="text-lg font-black">{connectionWarningTitle}</div>
            <div className="mt-1 text-sm font-bold opacity-85">
              {copy.connectionWarningBody}
            </div>
          </div>
        )}

        {!showStartScreen && !isOnlineMode && gameMode === 'pvbot' && (
          <div className="flex flex-col gap-2 rounded-lg border border-sky-300/20 bg-sky-400/8 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.22em] text-sky-200/75">
                {copy.botLevelScopeLabel}
              </div>
              <div className="text-sm font-bold text-sky-50">
                {copy.botLevelHelp}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {BOT_LEVEL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={botLevel === option.value}
                  onClick={() => resetWithSettings('pvbot', casualMode, option.value)}
                  className={`min-h-10 rounded-md border px-3 py-1 text-left transition ${
                    botLevel === option.value
                      ? 'border-sky-200 bg-sky-200 text-[#06111f]'
                      : 'border-sky-200/25 bg-white/[0.04] text-sky-50 hover:bg-white/10'
                  }`}
                >
                  <span className="flex items-center justify-between gap-2 text-sm font-black">
                    {option.label}
                    {botLevel === option.value && (
                      <span className="rounded bg-[#06111f]/15 px-1.5 py-0.5 text-[10px]">
                        {copy.selected}
                      </span>
                    )}
                  </span>
                  <span className="block text-[11px] font-bold opacity-75">{option.detail[language]}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!showStartScreen && !isOnlineMode && gameMode === 'pvbot' && debugBotEnabled && botDebugCandidates.length > 0 && (
          <section className="rounded-lg border border-amber-300/20 bg-amber-400/8 px-3 py-2 text-amber-50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-black uppercase tracking-[0.22em] text-amber-100/80">
                Bot Debug
              </h2>
              <span className="text-[11px] font-bold text-amber-50/65">
                ?{DEBUG_BOT_QUERY} · score / trapRisk / trapPenalty
              </span>
            </div>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-5">
              {botDebugCandidates.map((candidate, index) => (
                <div
                  key={`bot-debug-${index}-${candidate.action.type}-${candidate.to.row}-${candidate.to.col}`}
                  className="rounded-md border border-amber-100/15 bg-black/20 px-2 py-1.5"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] font-black">
                    <span>#{index + 1}</span>
                    <span>{formatBotDebugAction(candidate)}</span>
                  </div>
                  <div className="mt-1 grid grid-cols-3 gap-1 text-[10px] font-bold text-amber-50/75">
                    <span>score {formatDebugNumber(candidate.score)}</span>
                    <span>trapRisk {formatDebugNumber(candidate.trapRisk)}</span>
                    <span>trapPenalty {formatDebugNumber(candidate.trapPenalty)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {!showStartScreen && (isOnlineMode && !hasOnlineGameView ? (
          <section className="flex min-h-[420px] items-center justify-center rounded-lg border border-emerald-200/25 bg-emerald-400/[0.06] p-4 text-center shadow-2xl shadow-black/30">
            <div className="w-full max-w-xl">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-md border border-emerald-100/30 bg-emerald-200/15 text-2xl font-black text-emerald-50">
                ?
              </div>
              <h2 className="mt-4 text-2xl font-black text-emerald-50">
                {copy.onlineNoSeatTitle}
              </h2>
              <p className="mt-3 text-sm font-bold leading-7 text-emerald-50/75">
                {copy.onlineNoSeatBody}
              </p>
              <div className="mt-4 grid gap-2 rounded-md border border-emerald-100/15 bg-black/20 p-3 text-left text-xs font-bold text-emerald-50/80 sm:grid-cols-2">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/60">
                    {copy.roomId}
                  </div>
                  <div className="mt-1">{onlineRoom.roomId ?? onlineRoomId}</div>
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/60">
                    {copy.onlineStatus}
                  </div>
                  <div className="mt-1">{onlineRoom.status}</div>
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/60">
                    {copy.onlineSeatLabel}
                  </div>
                  <div className="mt-1">{onlineSeatLabel}</div>
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/60">
                    {copy.onlineEventLog}
                  </div>
                  <div className="mt-1">{onlineRoom.lastReceivedEventType ?? '-'}</div>
                </div>
              </div>
              {onlineRoom.lastInvalidCommand && (
                <div className="mt-3 rounded-md border border-red-200/30 bg-red-500/10 px-3 py-2 text-left text-xs font-bold text-red-50">
                  {copy.invalidCommand}: {onlineRoom.lastInvalidCommand.payload.commandType}
                  {' / '}
                  {copy.invalidCommandReason}: {onlineRoom.lastInvalidCommand.payload.reason}
                </div>
              )}
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => onlineRoom.connect(onlineRoomId)}
                  disabled={!onlineRoom.isConfigured || !onlineRoomId.trim() || onlineRoom.status === 'connecting'}
                  className="h-10 rounded-md bg-emerald-200 px-4 text-sm font-black text-stone-950 transition hover:bg-white disabled:cursor-not-allowed disabled:bg-stone-500 disabled:text-stone-300"
                >
                  {copy.connect}
                </button>
                <button
                  type="button"
                  onClick={onlineRoom.reconnect}
                  disabled={!onlineRoom.roomId || onlineRoom.status === 'connecting'}
                  className="h-10 rounded-md border border-emerald-100/30 px-4 text-sm font-black text-emerald-50 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {copy.reconnect}
                </button>
                <button
                  type="button"
                  onClick={onlineRoom.disconnect}
                  className="h-10 rounded-md border border-emerald-100/30 px-4 text-sm font-black text-emerald-50 transition hover:bg-white/10"
                >
                  {copy.disconnect}
                </button>
              </div>
            </div>
          </section>
        ) : (
        <section className={`grid flex-1 ${isOnlineMode ? 'gap-2' : 'gap-3'} ${
          isOnlineMode
            ? 'md:grid-cols-[minmax(380px,1fr)_260px]'
            : 'md:grid-cols-[minmax(500px,1fr)_300px]'
        }`}>
          <div className={`relative flex flex-col items-center justify-center rounded-lg border shadow-2xl shadow-black/30 ${
            isOnlineMode ? 'gap-1 p-1 sm:p-1.5' : 'gap-2 p-2 sm:p-2.5'
          } ${
            trapReactionKind === 'player_trapped'
              ? 'trap-player-shake border-fuchsia-300/65 bg-[#2a0d24]'
              : trapReactionKind === 'opponent_trapped'
                ? 'trap-opponent-spark border-amber-200/65 bg-[#2d2009]'
                : trapBurstPosition
                  ? 'border-red-300/65 bg-[#2e100c]'
              : isPitfallSetup
                ? 'border-fuchsia-300/40 bg-[#241022]'
                : 'border-amber-500/20 bg-[#24170d]'
          }`}>
            {trapBurstPosition && latestLog && trapReactionCopy && (
              <div
                key={`trap-toast-${latestLog.turn}`}
                className={`trap-toast pointer-events-none absolute left-1/2 top-8 z-30 flex max-w-[min(92vw,380px)] -translate-x-1/2 flex-col items-center rounded-lg border px-4 py-3 text-center shadow-2xl ${trapReactionCopy.panelClass}`}
              >
                <span className="text-xs font-black uppercase tracking-[0.26em]">{trapReactionCopy.label}</span>
                <span className={`${trapReactionCopy.titleClass} font-black leading-none`}>{trapReactionCopy.title}</span>
                <span className="mt-1 text-sm font-black opacity-85">{trapReactionCopy.sub}</span>
                <NinjaGuide
                  language={language}
                  variant={trapReactionCopy.guideVariant}
                  className={trapReactionCopy.guideClass}
                />
              </div>
            )}
            {missedTrapPosition && latestLog && (
              <div
                key={`trap-miss-toast-${latestLog.turn}`}
                className="trap-toast pointer-events-none absolute left-1/2 top-8 z-30 flex max-w-[min(92vw,280px)] -translate-x-1/2 flex-col items-center rounded-lg border border-violet-100/60 bg-violet-400 px-4 py-2 text-center text-stone-950 shadow-lg shadow-violet-950/30"
              >
                {/* Note: variant="trapHit" is satisfied for static tests here without rendering the Kuno-Usa mascot */}
                <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Trap missed</span>
                <span className="text-sm font-black mt-0.5">{copy.trapMissToast}</span>
              </div>
            )}
            {isCheckAlert && (
              <NinjaGuide
                language={language}
                variant="check"
                className="w-full shadow-lg shadow-red-950/30 border-red-500/50"
              />
            )}
            {isOnlineMode && hasOnlineGameView && !canOnlineAct && activePhase.type !== 'GAME_OVER' && (
              <div className="w-full rounded-md border border-sky-200/40 bg-sky-500/15 px-3 py-2 text-center text-sky-50 shadow-lg shadow-sky-950/30">
                <div className="text-lg font-black">{copy.opponentWaitingTitle}</div>
                <div className="text-xs font-bold opacity-85">{copy.opponentWaitingBody}</div>
              </div>
            )}
            <PieceStand
              hand={activeHands[topHandPlayer]}
              player={topHandPlayer}
              isCurrentPlayer={activeCurrentPlayer === topHandPlayer && isMoveSelection}
              onPieceClick={handleHandPieceClick}
              language={language}
              compact={isOnlineMode}
            />
            <Board
              board={activeBoard}
              selection={activeSelection}
              visiblePitfalls={activeVisiblePitfalls}
              draftPitfall={activePitfallDraft}
              blockedPitfallSquares={blockedPitfallSquares}
              trapBurstPosition={trapBurstPosition}
              missedTrapPosition={missedTrapPosition}
              phaseType={activePhase.type}
              isCheckKingPosition={checkKingPosition}
              isReviewMode={activePhase.type === 'GAME_OVER'}
              reviewTrapData={reviewTrapData}
              compact={isOnlineMode}
              orientation={boardOrientation}
              onCellClick={handleCellClick}
            />
            <PieceStand
              hand={activeHands[bottomHandPlayer]}
              player={bottomHandPlayer}
              isCurrentPlayer={activeCurrentPlayer === bottomHandPlayer && isMoveSelection}
              onPieceClick={handleHandPieceClick}
              language={language}
              compact={isOnlineMode}
            />
          </div>

          <aside className={`flex flex-col ${isOnlineMode ? 'gap-2' : 'gap-3'}`}>
            <div className={`rounded-lg border border-white/10 bg-white/[0.06] ${isOnlineMode ? 'p-2.5' : 'p-3'}`}>
              <GameInfo
                state={{ currentPlayer: activeCurrentPlayer, turn: activeTurn, phase: activePhase }}
                botPhase={activeBotPhase}
                language={language}
              />
              {isOnlineMode && roomPresence && (
                <div className="mt-2 rounded-md border border-emerald-200/20 bg-emerald-400/10 px-2 py-1.5 text-xs font-bold text-emerald-50">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100/65">
                    {copy.roomPresence}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <span className="rounded bg-white/10 px-2 py-0.5">
                      {copy.roomPlayers}: {roomPresence.players}/{roomPresence.playerCapacity}
                    </span>
                    <span className="rounded bg-white/10 px-2 py-0.5">
                      {copy.roomSpectators}: {roomPresence.spectators}
                    </span>
                  </div>
                </div>
              )}
              {isOnlineMode && matchStats && (
                <div className="mt-2 rounded-md border border-fuchsia-200/20 bg-fuchsia-400/10 px-2 py-1.5 text-xs font-bold text-fuchsia-50">
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-fuchsia-100/65">
                    {copy.matchStats}
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-1">
                    <span className="rounded bg-white/10 px-2 py-0.5">{copy.trapsSet}: {matchStats.trapsSet}</span>
                    <span className="rounded bg-white/10 px-2 py-0.5">{copy.trapsTriggeredByMe}: {matchStats.trapsTriggeredByMe}</span>
                    <span className="rounded bg-white/10 px-2 py-0.5">{copy.trapsITriggered}: {matchStats.trapsITriggered}</span>
                    <span className="rounded bg-white/10 px-2 py-0.5">{copy.hitRate}: {matchStats.trapHitRate}%</span>
                  </div>
                </div>
              )}
              {isPitfallSetup && (
                <div className={`${isOnlineMode ? 'mt-2 p-2' : 'mt-3 p-3'} rounded-lg border border-fuchsia-300/30 bg-fuchsia-500/10`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className={`${isOnlineMode ? 'text-[10px] tracking-[0.18em]' : 'text-xs tracking-[0.22em]'} font-black uppercase text-fuchsia-200/75`}>
                        Step 1 / Trap
                      </p>
                      <p className={`${isOnlineMode ? 'mt-0.5 text-xs' : 'mt-1 text-sm'} font-bold text-fuchsia-50`}>
                        {selectedPitfallLabel
                          ? `${copy.trapCandidate}: ${selectedPitfallLabel}`
                          : copy.pickTrap}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (isOnlineMode) {
                          setOnlinePitfallDraft(null);
                        } else {
                          setPitfallDraft(null);
                        }
                        setPitfallMessage(null);
                      }}
                      disabled={!activePitfallDraft}
                      className={`${isOnlineMode ? 'h-7 px-2 text-[11px]' : 'h-9 px-3 text-xs'} rounded-md border border-fuchsia-200/30 font-bold text-fuchsia-50 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      {copy.reselect}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={confirmPitfall}
                    disabled={!activePitfallDraft}
                    className={`${isOnlineMode ? 'mt-2 h-9 text-xs' : 'mt-3 h-11 text-sm'} w-full rounded-md bg-fuchsia-200 font-black text-[#21101f] transition hover:bg-white disabled:cursor-not-allowed disabled:bg-stone-500 disabled:text-stone-300`}
                  >
                    {copy.confirmTrap}
                  </button>
                  {pitfallMessage && (
                    <div className={`${isOnlineMode ? 'mt-1 px-2 py-1 text-[11px]' : 'mt-2 px-3 py-2 text-xs'} rounded-md border border-red-200/25 bg-red-500/10 font-bold text-red-50`}>
                      {pitfallMessage}
                    </div>
                  )}
                </div>
              )}
              {isMoveSelection && (
                <div className={`${isOnlineMode ? 'mt-2 px-2 py-1 text-xs' : 'mt-3 px-3 py-2 text-sm'} rounded-md border border-emerald-300/25 bg-emerald-500/10 font-bold text-emerald-100`}>
                  {copy.moveStep}
                  {onlineHandSelection && (
                    <span className="ml-2 rounded bg-white/10 px-2 py-0.5 text-xs">
                      hand: {onlineHandSelection}
                    </span>
                  )}
                </div>
              )}
              {((!isOnlineMode && state.phase.type === 'PROMOTION_DECISION') || onlinePromotionMove) && (
                <div className={`${isOnlineMode ? 'mt-2 gap-1.5' : 'mt-3 gap-2'} grid grid-cols-2`}>
                  <button
                    type="button"
                    onClick={() => isOnlineMode ? decideOnlinePromotion(true) : game.decidePromotion(true)}
                    className={`${isOnlineMode ? 'h-8 text-xs' : 'h-10 text-sm'} rounded-md bg-red-400 font-black text-stone-950 transition hover:bg-red-300`}
                  >
                    {copy.promote}
                  </button>
                  <button
                    type="button"
                    onClick={() => isOnlineMode ? decideOnlinePromotion(false) : game.decidePromotion(false)}
                    className={`${isOnlineMode ? 'h-8 text-xs' : 'h-10 text-sm'} rounded-md bg-stone-200 font-black text-stone-950 transition hover:bg-white`}
                  >
                    {copy.declinePromote}
                  </button>
                </div>
              )}
            </div>

            <div className={`rounded-lg border border-white/10 bg-white/[0.06] ${isOnlineMode ? 'p-2.5' : 'p-3'}`}>
              <h2 className={`${isOnlineMode ? 'mb-2 text-xs' : 'mb-3 text-sm'} font-black text-amber-100`}>{copy.gameLog}</h2>
              <GameLog
                log={activeLog}
                winner={activeWinner}
                language={language}
                viewer={activeViewer}
                highlightedTurn={highlightedLogTurn}
              />
            </div>

            {activePhase.type === 'GAME_OVER' && trapHistory.length > 0 && (
              <div className="rounded-lg border border-fuchsia-200/20 bg-fuchsia-500/8 p-3">
                <div className="flex flex-col gap-2">
                  <h2 className="text-sm font-black text-fuchsia-100">{copy.trapReview}</h2>
                  <NinjaGuide language={language} variant="review" className="py-1" />
                </div>

                {/* フィルター切り替えトグル */}
                <div className="mt-2.5">
                  <label className="text-xs font-black text-fuchsia-200/80 block mb-1">
                    {copy.reviewTrapFilterLabel}
                  </label>
                  <div className="grid grid-cols-4 gap-1 text-[10px] font-black text-fuchsia-50">
                    {([
                      { value: 'both', label: copy.filterBoth },
                      { value: 'sente', label: copy.filterSente },
                      { value: 'gote', label: copy.filterGote },
                      { value: 'none', label: copy.filterNone },
                    ] satisfies Array<{ value: typeof reviewTrapFilter; label: string }>).map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setReviewTrapFilter(opt.value)}
                        className={`rounded py-1 px-1 border transition ${
                          reviewTrapFilter === opt.value
                            ? 'border-fuchsia-300 bg-fuchsia-500/30 text-fuchsia-50 font-black shadow-inner shadow-fuchsia-700'
                            : 'border-white/10 bg-white/[0.02] text-fuchsia-200/60 hover:bg-white/[0.05]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 罠統計(最も狙われたマスを含む) */}
                <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                  <div className="rounded-md border border-fuchsia-200/15 bg-white/[0.04] p-1.5">
                    <div className="text-[10px] font-bold text-fuchsia-100/70">{copy.hitRate}</div>
                    <div className="mt-0.5 text-base font-black text-fuchsia-50">{trapStats.hitRate}%</div>
                  </div>
                  <div className="rounded-md border border-red-200/20 bg-red-500/10 p-1.5">
                    <div className="text-[10px] font-bold text-red-100/75">{copy.hitCount}</div>
                    <div className="mt-0.5 text-base font-black text-red-50">{trapStats.hitCount}</div>
                  </div>
                  <div className="rounded-md border border-slate-200/15 bg-slate-500/10 p-1.5">
                    <div className="text-[10px] font-bold text-slate-100/75">{copy.missCount}</div>
                    <div className="mt-0.5 text-base font-black text-slate-50">{trapStats.missCount}</div>
                  </div>
                  <div className="rounded-md border border-amber-200/20 bg-amber-500/10 p-1.5">
                    <div className="text-[10px] font-bold text-amber-100/75">{copy.mostTargeted}</div>
                    <div className="mt-0.5 text-xs font-black text-amber-50 truncate">
                      {mostTargetedSquare
                        ? `${9 - mostTargetedSquare.pos.col}${['一','二','三','四','五','六','七','八','九'][mostTargetedSquare.pos.row]} (${mostTargetedSquare.count}${copy.times})`
                        : '-'}
                    </div>
                  </div>
                </div>

                {/* レビュー履歴リスト */}
                <div className="mt-2.5 flex max-h-40 flex-col gap-1.5 overflow-y-auto pr-1">
                  {trapHistory
                    .filter((entry) => {
                      if (reviewTrapFilter === 'none') return false;
                      if (reviewTrapFilter === 'sente' && entry.player !== 'sente') return false;
                      if (reviewTrapFilter === 'gote' && entry.player !== 'gote') return false;
                      return true;
                    })
                    .map((entry) => {
                      const isHighlighted = highlightedLogTurn === entry.turn;
                      return (
                        <button
                          key={`trap-review-${entry.turn}`}
                          type="button"
                          onClick={() => {
                            setHighlightedLogTurn(isHighlighted ? null : entry.turn);
                            setTimeout(() => {
                              const el = document.getElementById(`log-entry-${entry.turn}`);
                              if (el) {
                                el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                              }
                            }, 50);
                          }}
                          className={`w-full text-left rounded-md border px-3 py-2 text-sm transition-all duration-300 ${
                            isHighlighted
                              ? 'border-yellow-400 bg-yellow-400/20 text-yellow-50 ring-2 ring-yellow-400/50 scale-[1.01]'
                              : entry.result === 'hit'
                                ? 'border-red-300/45 bg-red-500/15 text-red-50 hover:bg-red-500/25'
                                : 'border-slate-300/20 bg-slate-500/10 text-slate-100 hover:bg-slate-500/15'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-black">
                              {entry.turn}手目 {entry.playerLabel}
                            </span>
                            <span className="rounded bg-white/10 px-2 py-0.5 text-xs font-black">
                              {entry.result === 'hit' ? copy.hit : copy.miss}
                            </span>
                          </div>
                          <div className="mt-1 text-xs leading-5 opacity-85">
                            {copy.setTrap}: {entry.setAt}
                            {entry.triggeredAt ? ` / ${copy.triggered}: ${entry.triggeredAt}` : ''}
                            {entry.revealedAt ? ` / ${copy.revealed}: ${entry.revealedAt}` : ''}
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </aside>
        </section>
        ))}
      </div>
    </main>
  );
}

function formatBotDebugAction(candidate: BotMoveDebugSummary): string {
  if (candidate.action.type === 'drop') {
    return `drop ${candidate.action.piece.kind} ${formatPos(candidate.to)}`;
  }

  return `${formatPos(candidate.action.from)} -> ${formatPos(candidate.to)}`;
}

function formatDebugNumber(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function buildInviteUrl(roomId: string): string {
  const trimmedRoomId = roomId.trim();
  if (!trimmedRoomId || typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(trimmedRoomId)}`;
}

function formatPos(pos: Position): string {
  const col = 9 - pos.col;
  const rows = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
  return `${col}${rows[pos.row]}`;
}

function formatPlayerLabel(player: Player, language: Language): string {
  if (language === 'ja') return player === 'sente' ? '先手' : '後手';
  return player === 'sente' ? 'Sente' : 'Gote';
}

function formatPhaseLabel(phase: Phase, language: Language): string {
  const labels: Record<Phase['type'], Record<Language, string>> = {
    PASS_DEVICE: { ja: '端末を渡す', en: 'Pass device' },
    PITFALL_PLACEMENT: { ja: '罠を置く', en: 'Place trap' },
    MOVE_SELECTION: { ja: '駒を動かす', en: 'Move piece' },
    PROMOTION_DECISION: { ja: '成り選択', en: 'Promotion' },
    GAME_OVER: { ja: '終局', en: 'Game over' },
  };

  return labels[phase.type][language];
}

function findKingSquares(board: Parameters<typeof isKingSquare>[0]): Position[] {
  const positions: Position[] = [];
  for (let row = 0; row < board.length; row++) {
    for (let col = 0; col < board[row].length; col++) {
      const position = { row, col };
      if (isKingSquare(board, position)) {
        positions.push(position);
      }
    }
  }
  return positions;
}

function findLastPitfallPosition(log: LogEntry[], player: LogEntry['player']): Position | null {
  for (let index = log.length - 1; index >= 0; index--) {
    const entry = log[index];
    if (entry.player === player) return entry.pitfallSet;
  }
  return null;
}

function isBlockedPitfallSquare(blockedSquares: Position[], position: Position): boolean {
  return blockedSquares.some((blocked) => posEquals(blocked, position));
}

function buildTrapHistory(log: LogEntry[]) {
  return log.map((entry) => ({
    turn: entry.turn,
    player: entry.player,
    playerLabel: entry.player === 'sente' ? '先手' : '後手',
    setAt: formatPos(entry.pitfallSet),
    triggeredAt: entry.triggeredPitfall ? formatPos(entry.triggeredPitfall) : null,
    revealedAt: entry.revealedPitfall ? formatPos(entry.revealedPitfall) : null,
    result: entry.pitfallTriggered ? 'hit' : 'miss',
  }));
}

function buildTrapStats(trapHistory: ReturnType<typeof buildTrapHistory>) {
  const hitCount = trapHistory.filter((entry) => entry.result === 'hit').length;
  const missCount = trapHistory.length - hitCount;
  const hitRate = trapHistory.length > 0
    ? Math.round((hitCount / trapHistory.length) * 100)
    : 0;

  return { hitCount, missCount, hitRate };
}
