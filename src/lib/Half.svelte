<script lang="ts">
  import { conversation, type Side } from './conversation.svelte';
  import { settings } from './settings.svelte';
  import { UI_FOREIGN, wordCount } from './langs';
  import Icon from './Icon.svelte';

  let { side, flipped = false }: { side: Side; flipped?: boolean } = $props();

  const other: Side = $derived(side === 'me' ? 'them' : 'me');
  // Big: the other person's last words, translated into this person's language.
  const big = $derived(conversation.lastTurnBy(other));
  // Small: how this person's own speech was heard — live while speaking, else their last phrase.
  const own = $derived(conversation.lastTurnBy(side));
  const live = $derived(conversation.partial.side === side ? conversation.partial.text : '');
  const small = $derived(live || own?.srcText || '');
  const isLive = $derived(!!live);
  // Only the newest exchange stays bright; an older translation fades a little.
  const stale = $derived(!!big && conversation.turns.at(-1)?.id !== big.id && conversation.turns.at(-1)?.side === other);
  const huge = $derived(!!big?.text && wordCount(big.text) <= 3 && big.text.length <= 24);
  const long = $derived((big?.text.length ?? 0) > 140);
  const speaking = $derived(!!big && conversation.speakingTurn === big.id);

  const t = $derived(
    side === 'me'
      ? { hint: 'Говорите по-русски', listening: 'Слушаю', pause: 'Пауза', resume: 'Продолжить', replay: 'Повторить', mine: 'Это сказал я' }
      : {
          hint: UI_FOREIGN[settings.foreign].speakNow,
          listening: UI_FOREIGN[settings.foreign].listening,
          pause: 'II',
          resume: '▶',
          replay: '↻',
          mine: UI_FOREIGN[settings.foreign].mine,
        },
  );
  const status = $derived(conversation.status);
</script>

<section class="half" class:flipped aria-label={side === 'me' ? 'Моя половина' : 'Половина собеседника'}>
  <div class="corner">
    <span class="dot {status}" class:speaking></span>
    <span class="spacer"></span>
    <button class="icon-btn" class:on={status === 'paused'} onclick={() => conversation.togglePause()} aria-label={status === 'paused' ? t.resume : t.pause} title={status === 'paused' ? t.resume : t.pause}>
      <Icon name={status === 'paused' ? 'micOff' : 'mic'} />
    </button>
    <button class="icon-btn" class:on={speaking} onclick={() => conversation.replay(side)} disabled={!big?.text} aria-label={t.replay} title={t.replay}>
      <Icon name="speaker" />
    </button>
    <button class="icon-btn" onclick={() => conversation.claim(side)} disabled={!conversation.turns.length} aria-label={t.mine} title={t.mine}>
      <Icon name="me" />
    </button>
  </div>

  <div class="big" class:huge class:long class:stale>
    {#if big?.text}
      {#key big.id}
        <p class="appear">{big.text}</p>
      {/key}
    {:else if !small}
      <p class="hint">{t.hint}</p>
    {/if}
  </div>

  <p class="small" class:live={isLive}>{small}</p>
</section>

<style>
  .half {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    padding: 14px 20px 14px;
  }
  .half.flipped { transform: rotate(180deg); }
  .half:not(.flipped) { padding-bottom: calc(14px + env(safe-area-inset-bottom)); }
  .half.flipped { padding-bottom: calc(14px + env(safe-area-inset-top)); }

  .corner { display: flex; align-items: center; gap: 8px; }
  .corner .spacer { flex: 1; }
  .corner .icon-btn { width: 32px; height: 32px; opacity: 0.75; }
  .corner .icon-btn:disabled { opacity: 0.25; }
  .corner :global(svg) { width: 16px; height: 16px; }

  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-3); transition: background 0.3s ease; }
  .dot.listening { background: var(--accent); animation: breathe 2.4s ease-in-out infinite; }
  .dot.translating { background: var(--text-2); animation: breathe 0.9s ease-in-out infinite; }
  .dot.speaking, .dot.speaking.listening { background: var(--accent); animation: none; box-shadow: 0 0 0 4px var(--accent-soft); }
  .dot.paused, .dot.off { background: transparent; box-shadow: inset 0 0 0 1.5px var(--text-3); }
  @keyframes breathe { 50% { opacity: 0.35; } }

  .big {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    justify-content: center;
    font-size: clamp(26px, 6.6vw, 44px);
    line-height: 1.18;
    font-weight: 600;
    letter-spacing: -0.02em;
    transition: opacity 0.4s ease;
  }
  .big p { margin: 0; overflow-wrap: anywhere; }
  .big.long { font-size: clamp(21px, 5.2vw, 34px); justify-content: flex-start; }
  .big.huge { font-size: clamp(56px, 17vw, 128px); line-height: 1.02; text-align: center; letter-spacing: -0.035em; }
  .big.stale { opacity: 0.45; }
  .big .hint { color: var(--text-3); font-weight: 500; font-size: clamp(20px, 5vw, 28px); text-align: center; }
  .appear { animation: appear 0.28s ease-out; }
  @keyframes appear { from { opacity: 0; transform: translateY(6px); } }

  .small {
    margin: 8px 0 0;
    min-height: 1.35em;
    max-height: 4.1em;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    font-size: 15px;
    line-height: 1.35;
    color: var(--text-3);
  }
  .small.live { color: var(--text-2); }
</style>
