<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import LoginModal from "./LoginModal.svelte";
  import { API_BASE, VISITOR_COUNT_REFRESH_INTERVAL } from "../helpers/Constants";
  import { EyeIcon } from "lucide-svelte";

  export let title = "Trip Tracker";
  export let version: string | null = "V1";
  export let showSidebarToggle: boolean = false;
  export let showVisitorCount: boolean = true;
  export let statusText: string | null = null;

  const dispatch = createEventDispatcher<{
      toggleSidebar: void;
  }>();

  let visitorCount: number = 1;
  let visitorInterval: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
      if (showVisitorCount) {
          let visitorId = localStorage.getItem("visitorId");
          if (!visitorId) {
              visitorId = Math.random().toString(36).substring(2) + Date.now().toString(36);
              localStorage.setItem("visitorId", visitorId);
          }

          const fetchVisitors = async () => {
              try {
                  const res = await fetch(API_BASE + `/api/visitors?id=${visitorId}`);
                  const data = await res.json();
                  visitorCount = data.count;
              } catch (e) {
                  console.error("Failed to fetch visitors", e);
              }
          };

          fetchVisitors();
          // Refresh visitor count every minute
          visitorInterval = setInterval(fetchVisitors, VISITOR_COUNT_REFRESH_INTERVAL);
      }
  });

  // Svelte ignores onMount return values — clean up intervals in onDestroy
  onDestroy(() => {
      if (visitorInterval !== null) {
          clearInterval(visitorInterval);
      }
  });
</script>

<div class="controls">
  {#if showSidebarToggle}
    <button class="sidebar-toggle-btn" on:click={() => dispatch("toggleSidebar")}>
      ☰
    </button>
  {/if}

  <div class="title-block">
    <h1>{title}</h1>
    {#if version}
      <span class="version">{version}</span>
    {/if}
  </div>

  {#if showVisitorCount}
    <span class="visitor-count" title="Number of visitors currently on the site">
      {visitorCount} <EyeIcon size="20" style="vertical-align: middle;" /> 
    </span>
  {/if}
  <div class="buttons">
    <slot name="buttons"></slot>
  </div>

  {#if statusText}
    <div class="status">{statusText}</div>
  {/if}
</div>
<LoginModal />
