'use client';

type Language = 'ja' | 'en';
type NinjaGuideVariant = 'title' | 'help' | 'trapHit' | 'playerTrapped' | 'opponentTrapped' | 'review' | 'check';

type Props = {
  language: Language;
  variant: NinjaGuideVariant;
  className?: string;
};

const GUIDE_COPY: Record<NinjaGuideVariant, Record<Language, {
  name: string;
  role: string;
  line: string;
}>> = {
  title: {
    ja: {
      name: 'くのうさ',
      role: '案内役',
      line: 'その一手、ほんとに大丈夫？',
    },
    en: {
      name: 'Kuno-Usa',
      role: 'Guide',
      line: 'Are you sure about that move?',
    },
  },
  help: {
    ja: {
      name: 'くのうさ',
      role: '読み合いメモ',
      line: '取れる駒ほど、罠かもよ？',
    },
    en: {
      name: 'Kuno-Usa',
      role: 'Trap tip',
      line: 'The tastier the capture, the trap-lier it gets.',
    },
  },
  trapHit: {
    ja: {
      name: 'くのうさ',
      role: '罠命中',
      line: 'にひひ、読まれてたね！',
    },
    en: {
      name: 'Kuno-Usa',
      role: 'Trap hit',
      line: 'Hehe, you were read.',
    },
  },
  playerTrapped: {
    ja: {
      name: 'くのうさ',
      role: '移動失敗',
      line: 'その一手、読まれてたよ……',
    },
    en: {
      name: 'Kuno-Usa',
      role: 'Move failed',
      line: 'That move was read...',
    },
  },
  opponentTrapped: {
    ja: {
      name: 'くのうさ',
      role: '読み勝ち',
      line: 'にひひ、読まれてたね！',
    },
    en: {
      name: 'Kuno-Usa',
      role: 'Outread',
      line: 'Hehe, you read that perfectly!',
    },
  },
  review: {
    ja: {
      name: 'くのうさ',
      role: '振り返り',
      line: '不発でも、相手の癖は見えたよ。',
    },
    en: {
      name: 'Kuno-Usa',
      role: 'Review',
      line: 'Even a missed trap reveals a habit.',
    },
  },
  check: {
    ja: {
      name: 'くのうさ',
      role: '王手警告',
      line: '王手だよ！逃げ道を探して！',
    },
    en: {
      name: 'Kuno-Usa',
      role: 'Check Alert',
      line: 'You are in check! Find an escape!',
    },
  },
};

const VARIANT_STYLE: Record<NinjaGuideVariant, string> = {
  title: 'border-amber-200/25 bg-amber-100/[0.06] text-amber-50',
  help: 'border-stone-900/15 bg-white/25 text-stone-950',
  trapHit: 'border-red-100/45 bg-stone-950/18 text-stone-950',
  playerTrapped: 'border-fuchsia-100/45 bg-stone-950/18 text-stone-950',
  opponentTrapped: 'border-amber-100/55 bg-stone-950/18 text-stone-950',
  review: 'border-stone-900/15 bg-white/25 text-stone-950',
  check: 'border-red-500 bg-red-500/20 text-red-50 check-king-pulse',
};

const IMAGE_STYLE: Record<NinjaGuideVariant, string> = {
  title: 'h-16',
  help: 'h-16',
  trapHit: 'h-20',
  playerTrapped: 'h-24',
  opponentTrapped: 'h-24',
  review: 'h-16',
  check: 'h-16',
};

const IMAGE_SOURCE: Record<NinjaGuideVariant, string> = {
  title: './mascots/kuno-usa-ui.png',
  help: './mascots/kuno-usa-ui.png',
  trapHit: './mascots/kuno-usa-wana-ui.png',
  playerTrapped: './mascots/trapped-kunousa-reaction.png',
  opponentTrapped: './mascots/triumphs-kunousa-reaction.png',
  review: './mascots/kuno-usa-ui.png',
  check: './mascots/kuno-usa-ui.png',
};

export default function NinjaGuide({ language, variant, className = '' }: Props) {
  const copy = GUIDE_COPY[variant][language];
  const isTrapReaction = variant === 'trapHit' || variant === 'playerTrapped' || variant === 'opponentTrapped';

  return (
    <aside
      className={`flex items-center gap-3 rounded-md border px-3 py-2 ${VARIANT_STYLE[variant]} ${className}`}
      aria-label={`${copy.name} ${copy.role}`}
    >
      <div className="flex h-16 w-20 shrink-0 items-end justify-center overflow-visible" aria-hidden="true">
        {/* Use a relative public asset path so itch.io subpath embeds can load the mascot. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={IMAGE_SOURCE[variant]}
          alt=""
          width={variant === 'playerTrapped' ? 520 : variant === 'opponentTrapped' ? 427 : variant === 'trapHit' ? 415 : 331}
          height={512}
          className={`${IMAGE_STYLE[variant]} ${isTrapReaction ? 'kuno-usa-pixel-snap' : ''} w-auto object-contain drop-shadow-[0_8px_10px_rgba(0,0,0,0.35)]`}
        />
      </div>
      <div className={isTrapReaction ? 'text-left' : 'min-w-0'}>
        <div className={`text-[10px] font-black uppercase tracking-[0.18em] ${isTrapReaction ? 'text-stone-900/70' : 'opacity-70'}`}>
          {copy.name} / {copy.role}
        </div>
        <div className={`${isTrapReaction ? 'text-sm' : 'text-sm'} font-black leading-5`}>
          {copy.line}
        </div>
      </div>
    </aside>
  );
}
