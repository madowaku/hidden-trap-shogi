// 研究用の棋譜表示（人間が局面を追えるように）

const KANJI = {
  king: '玉', rook: '飛', bishop: '角', gold: '金', silver: '銀', knight: '桂', lance: '香', pawn: '歩',
  promoted_rook: '龍', promoted_bishop: '馬', promoted_silver: '全', promoted_knight: '圭',
  promoted_lance: '杏', promoted_pawn: 'と',
};
const CODE = {
  king: 'K', rook: 'R', bishop: 'B', gold: 'G', silver: 'S', knight: 'N', lance: 'L', pawn: 'P',
  promoted_rook: 'D', promoted_bishop: 'H', promoted_silver: 'T', promoted_knight: 'M',
  promoted_lance: 'Y', promoted_pawn: 'Z',
};
const KIND_OF = Object.fromEntries(Object.entries(CODE).map(([kind, code]) => [code, kind]));
const ROW_KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const HAND_ORDER = ['rook', 'bishop', 'gold', 'silver', 'knight', 'lance', 'pawn'];

/** 盤面を 162 文字に詰める（先手 = 大文字、後手 = 小文字、空 = '.'） */
export function encodeBoard(board) {
  return board.map(row => row.map(cell => {
    if (!cell) return '.';
    const code = CODE[cell.kind];
    return cell.owner === 'sente' ? code : code.toLowerCase();
  }).join('')).join('/');
}

export function square(position) {
  return `${9 - position.col}${ROW_KANJI[position.row]}`;
}

const MARK = { sente: '☗', gote: '☖' };

export function notation(action) {
  if (!action) return '—';
  const piece = KANJI[action.piece.kind];
  if (action.type === 'drop') return `${square(action.to)}${piece}打`;
  return `${square(action.to)}${piece}${action.promote ? '成' : ''}（${square(action.from)}）`;
}

function handText(hand) {
  const parts = HAND_ORDER.filter(kind => hand[kind] > 0).map(kind => `${KANJI[kind]}${hand[kind] > 1 ? hand[kind] : ''}`);
  return parts.length > 0 ? parts.join(' ') : 'なし';
}

/** 盤面図。罠のマスを指定すると「※」で示す */
export function diagram(encoded, hands, marks = {}) {
  const rows = encoded.split('/');
  const lines = [`☖持駒: ${handText(hands.gote)}`, '  ９ ８ ７ ６ ５ ４ ３ ２ １'];
  rows.forEach((row, r) => {
    let line = '';
    for (let c = 0; c < 9; c++) {
      const ch = row[c];
      const key = `${r}:${c}`;
      if (ch === '.') {
        line += marks[key] ? ` ${marks[key]}` : ' ・';
      } else {
        const kind = KIND_OF[ch.toUpperCase()];
        const gote = ch === ch.toLowerCase();
        line += `${gote ? 'v' : ' '}${KANJI[kind]}`;
      }
    }
    lines.push(`${line} ${ROW_KANJI[r]}`);
  });
  lines.push(`☗持駒: ${handText(hands.sente)}`);
  return lines.join('\n');
}

const EVENT_NOTE = {
  kingImmune: 'B: 王の移動なので罠が効かない',
  retry: 'C: 救済で指し直し',
  voided: 'D: 王手をかけたので自分の罠は消えた',
};

const ENDING_LABEL = {
  roulette: '受けが 2 通り以上ある王手で、選んだ受けを罠で潰されて王を取られた（王手ルーレット）',
  'trap-mate': '受けが 1 通りしかない王手で、そこに罠があった（罠詰み）',
  mate: '受けのない王手（詰み）',
  'missed-defense': '受けがあったのに受けなかった',
  'self-exposure': '王手されていないのに、自分の手で王を取られる形にした',
  hopeless: 'どの手でも負けを読み切っていた局面で王を取られた（必至・投了相当）',
  draw: '300 手で引き分け',
};

/** 長い対局は序盤と終盤だけ載せる */
const HEAD_PLIES = 10;
const TAIL_PLIES = 20;

function moveTable(records) {
  const lines = ['| 手 | 手番 | 指し手 | 状況 |', '| ---: | :---: | --- | --- |'];
  const long = records.length > HEAD_PLIES + TAIL_PLIES + 4;
  records.forEach((record, index) => {
    if (long && index >= HEAD_PLIES && index < records.length - TAIL_PLIES) {
      if (index === HEAD_PLIES) lines.push(`| … | | （中略 ${records.length - HEAD_PLIES - TAIL_PLIES} 手） | |`);
      return;
    }
    const notes = [];
    if (record.inCheck) notes.push(`王手されている（受け ${record.check.destinations} 通り）`);
    if (record.trapped && record.event !== 'retry') notes.push(`★罠（${square(record.trap)}）で失敗`);
    if (record.event === 'retry') notes.push(`★罠（${square(record.trap)}）→ ${notation(record.retryAction)} に指し直し`);
    if (record.event && record.event !== 'retry') notes.push(EVENT_NOTE[record.event]);
    lines.push(`| ${index + 1} | ${MARK[record.player]} | ${notation(record.action)} | ${notes.join('、')} |`);
  });
  return lines.join('\n');
}

function decisiveComment(game) {
  if (!game.winner) return '';
  const loser = game.winner === 'sente' ? 'gote' : 'sente';
  const lastIndex = game.records.map(record => record.player).lastIndexOf(loser);
  const last = game.records[lastIndex];
  const lines = [];
  lines.push(`決着の局面（${lastIndex + 1} 手目、${MARK[loser]}の手番の前）。※は${MARK[game.winner]}の罠:`);
  lines.push('');
  lines.push('```');
  lines.push(diagram(last.board, last.hands, last.trap ? { [`${last.trap.row}:${last.trap.col}`]: '※' } : {}));
  lines.push('```');
  lines.push('');
  if (last.inCheck) {
    const escapes = last.check.kingEscapes;
    lines.push(`- ${MARK[loser]}は王手されている。受けになる手の着地点は ${last.check.destinations} 通り（うち玉が逃げる手 ${escapes} 手）。`);
  } else {
    lines.push(`- ${MARK[loser]}は王手されていなかった。`);
  }
  lines.push(`- ${MARK[loser]}は ${notation(last.action)} を選んだ${last.trapProbability !== null ? `（この手が罠にかかる確率を ${Math.round(last.trapProbability * 100)}% と見積もっていた）` : ''}。`);
  if (last.event === 'retry') {
    lines.push(`- 罠（${square(last.trap)}）で失敗し、${notation(last.retryAction)} に指し直したが、王は助からなかった。`);
  } else if (last.trapped) {
    lines.push(`- そこに${MARK[game.winner]}の罠（${square(last.trap)}）があり、手は失敗。次の手で王を取られた。`);
  }
  if (last.value !== null) {
    lines.push(`- この手番の前の形勢（${MARK[loser]}から見た読み合い込みの評価）: ${last.value.toFixed(2)}（-1 = 負け、+1 = 勝ち）`);
  }
  return lines.join('\n');
}

export function renderKifu(variant, picks) {
  const out = [`# 代表棋譜: ${variant}`, ''];
  out.push('自動対戦（読み合いエンジン同士、変種ルールを理解して指す）から選んだ対局。');
  out.push('座標は「筋 + 段」（例: 7六）。☗ = 先手、☖ = 後手。盤面図の v は後手の駒。');
  out.push('');
  for (const { reason, game } of picks) {
    out.push(`## ${reason}`);
    out.push('');
    out.push(`- seed ${game.seed}、${game.plies} 手、勝者: ${game.winner ? MARK[game.winner] : 'なし'}`);
    out.push(`- 決着: ${ENDING_LABEL[game.ending] ?? game.ending}`);
    out.push(`- 形勢の入れ替わり: ${game.leadChanges} 回${game.comeback ? '（逆転勝ち）' : ''}`);
    out.push('');
    out.push(moveTable(game.records));
    out.push('');
    out.push(decisiveComment(game));
    out.push('');
  }
  return `${out.join('\n')}\n`;
}
