<script lang="ts">
  import { conversation } from './conversation.svelte';
  import { LANGS } from './langs';

  let list: HTMLDivElement | undefined = $state();
  const turns = $derived(conversation.turns.slice(-40));

  $effect(() => {
    // Follow the newest phrase.
    void turns.length;
    void turns.at(-1)?.text;
    void conversation.partial.text;
    list?.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  });
</script>

<div class="single" bind:this={list}>
  {#each turns as t (t.id)}
    <article class:mine={t.side === 'me'}>
      <p class="src">{LANGS[t.src].flag} {t.srcText}</p>
      <p class="tr">{t.text || '…'}</p>
    </article>
  {/each}
  {#if conversation.partial.text}
    <article class="live" class:mine={conversation.partial.side === 'me'}>
      <p class="src">{conversation.partial.text}</p>
    </article>
  {/if}
  {#if !turns.length && !conversation.partial.text}
    <p class="empty">Говорите — перевод появится здесь.</p>
  {/if}
</div>

<style>
  .single {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 16px 16px 24px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  article {
    max-width: 88%;
    align-self: flex-start;
    background: var(--bg-2);
    border-radius: 18px;
    padding: 10px 14px 12px;
    animation: appear 0.25s ease-out;
  }
  article.mine { align-self: flex-end; background: var(--accent-soft); }
  .src { margin: 0 0 4px; font-size: 14px; color: var(--text-2); line-height: 1.35; }
  .tr { margin: 0; font-size: 22px; font-weight: 600; line-height: 1.22; letter-spacing: -0.015em; }
  article.live { background: transparent; box-shadow: inset 0 0 0 1px var(--sep); }
  .empty { margin: auto; color: var(--text-3); font-size: 18px; }
  @keyframes appear { from { opacity: 0; transform: translateY(6px); } }
</style>
