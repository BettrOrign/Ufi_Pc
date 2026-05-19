import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getOrLaunchBrowser } from './browser-manager';
import { stagehandAgentTool } from './stagehand-agent-tool';

// ============================================================
// Snapshot refs storage — maps @e1, @e5 etc. to element info
// Persists across tool calls within one agent execution
// ============================================================
export interface ElementInfo {
  ref: string;
  tag: string;
  text: string;
  ariaLabel: string;
  placeholder: string;
  href: string;
  role: string;
  selector: string;
  rect: { x: number; y: number; width: number; height: number };
}

let snapshotRefs: Record<string, ElementInfo> = {};

// ============================================================
// goto — Navigate to a URL
// ============================================================
export const goto = createTool({
  id: 'goto',
  description: 'Navigate to a URL in the browser. Use this to open websites. Returns the page title and visible text content.',
  inputSchema: z.object({
    url: z.string().describe('Full URL to navigate to (e.g., https://www.youtube.com)'),
  }),
  outputSchema: z.object({
    title: z.string(),
    url: z.string(),
    content: z.string(),
  }),
  execute: async ({ url }) => {
    const { page } = await getOrLaunchBrowser();
    try {
      // Clear stale refs on navigation
      snapshotRefs = {};
      // Use domcontentloaded instead of networkidle0 — YouTube never goes idle due to ads/trackers
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      // Brief settle time for dynamic content to start rendering
      await new Promise(r => setTimeout(r, 2000));
      const title = await page.title();
      const currentUrl = page.url();
      // Get visible text
      const bodyText = await page.evaluate(() => {
        const main = document.querySelector('main') || document.body;
        return (main as HTMLElement).innerText?.slice(0, 3000) || '';
      });
      console.log(`[Browser] Navigated to: ${title} (${currentUrl})`);
      return { title, url: currentUrl, content: bodyText };
    } catch (err: any) {
      console.error(`[Browser] goto error:`, err.message);
      const title = await page.title().catch(() => 'Error');
      const currentUrl = page.url();
      return { title, url: currentUrl, content: `Error: ${err.message}` };
    }
  },
});

// ============================================================
// snapshot — Get page content with interactive element refs
// ============================================================
export const snapshot = createTool({
  id: 'snapshot',
  description: 'Get the current browser page content as text. Each interactive element (links, buttons, inputs) has a ref like @e1, @e5. Use these refs with click/type/press tools to interact with the page.',
  inputSchema: z.object({}),
  outputSchema: z.object({
    title: z.string(),
    url: z.string(),
    content: z.string(),
    elementCount: z.number(),
  }),
  execute: async () => {
    const { page } = await getOrLaunchBrowser();
    const title = await page.title();
    const url = page.url();

    // Collect all interactive elements with CSS selectors
    const elements = await page.evaluate(() => {
      const interactiveTags = new Set(['a', 'button', 'input', 'textarea', 'select', 'summary']);
      const interactiveRoles = new Set(['button', 'link', 'textbox', 'combobox', 'checkbox', 'radio', 'tab', 'menuitem', 'option', 'searchbox', 'slider']);

      // Only query potentially interactive elements instead of all *
      const allElements = document.querySelectorAll('a, button, input, textarea, select, summary, [role], [tabindex]');
      const result: any[] = [];
      let refNum = 1;

      for (const el of allElements) {
        const tag = el.tagName.toLowerCase();
        let isInteractive = interactiveTags.has(tag);

        if (!isInteractive) {
          const role = el.getAttribute('role');
          isInteractive = !!(role && interactiveRoles.has(role));
        }
        if (!isInteractive && (el as HTMLElement).tabIndex >= 0 && (el as HTMLElement).tabIndex <= 0) {
          isInteractive = true;
        }
        if (!isInteractive) continue;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (rect.width < 5 || rect.height < 5) continue;

        // Skip elements entirely off-screen
        if (rect.right < 0 || rect.bottom < 0) continue;

        const ref = `@e${refNum++}`;
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        const ariaLabel = el.getAttribute('aria-label') || '';
        const placeholder = el.getAttribute('placeholder') || '';
        const href = el.getAttribute('href') || '';
        const role = el.getAttribute('role') || tag;
        const title_attr = el.getAttribute('title') || '';
        const dataTestId = el.getAttribute('data-testid') || '';

        // Generate CSS selector — try multiple strategies
        let selector = '';

        // Strategy 1: ID (most reliable)
        if (el.id) {
          selector = `#${CSS.escape(el.id)}`;
        }
        // Strategy 2: data-testid
        else if (dataTestId) {
          selector = `[data-testid="${CSS.escape(dataTestId)}"]`;
        }
        // Strategy 3: unique aria-label
        else if (ariaLabel && document.querySelectorAll(`[aria-label="${CSS.escape(ariaLabel)}"]`).length === 1) {
          selector = `[aria-label="${CSS.escape(ariaLabel)}"]`;
        }
        // Strategy 4: unique text content for buttons/links
        else if ((tag === 'button' || tag === 'a') && text && document.querySelectorAll(`${tag}`).length > 1) {
          // Try matching by text content
          selector = `${tag}:nth-child(${Array.from(el.parentElement?.children || []).indexOf(el) + 1})`;
          // Build CSS path using nth-child as before
          const path: string[] = [];
          let current: Element | null = el;
          while (current && current !== document.body && current !== document.documentElement) {
            const parent = current.parentElement;
            if (!parent) break;
            const siblings = Array.from(parent.children);
            const index = siblings.indexOf(current) + 1;
            const tagName = current.tagName.toLowerCase();
            const cls = (current as HTMLElement).className;
            const classStr = typeof cls === 'string' && cls ? `.${CSS.escape(cls.split(' ')[0])}` : '';
            path.unshift(`${tagName}${classStr}:nth-child(${index})`);
            current = parent;
          }
          selector = path.join(' > ');
        }
        // Strategy 5: CSS path using nth-child
        else {
          const path: string[] = [];
          let current: Element | null = el;
          while (current && current !== document.body && current !== document.documentElement) {
            const parent = current.parentElement;
            if (!parent) break;
            const siblings = Array.from(parent.children);
            const index = siblings.indexOf(current) + 1;
            const tagName = current.tagName.toLowerCase();
            const cls = (current as HTMLElement).className;
            const classStr = typeof cls === 'string' && cls ? `.${CSS.escape(cls.split(' ')[0])}` : '';
            path.unshift(`${tagName}${classStr}:nth-child(${index})`);
            current = parent;
          }
          selector = path.join(' > ');
        }

        result.push({
          ref, tag, text, ariaLabel, placeholder, href, role, selector,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        });
      }

      return result;
    });

    // Store refs for other tools
    snapshotRefs = {};
    for (const el of elements) {
      snapshotRefs[el.ref] = el;
    }

    // Format a human-readable content string for the LLM
    const lines: string[] = [];
    lines.push(`Title: ${title}`);
    lines.push(`URL: ${url}`);
    lines.push('');

    for (const el of elements) {
      const parts = [`${el.ref}: <${el.tag}`];
      if (el.role && el.role !== el.tag) parts.push(` role="${el.role}"`);
      if (el.text) parts.push(` "${el.text.slice(0, 80)}"`);
      if (el.href) parts.push(` → ${el.href.slice(0, 80)}`);
      if (el.ariaLabel) parts.push(` [${el.ariaLabel}]`);
      if (el.placeholder) parts.push(` [${el.placeholder}]`);
      parts.push('>');
      lines.push(parts.join(''));
    }

    if (elements.length === 0) {
      lines.push('(no interactive elements found)');
      lines.push('');
      // Add raw page text as fallback
      const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 3000) || '');
      lines.push('--- Page text ---');
      lines.push(bodyText);
    }

    return {
      title,
      url,
      content: lines.join('\n'),
      elementCount: elements.length,
    };
  },
});

// ============================================================
// click — Click an element by ref (uses Puppeteer native API)
// ============================================================
export const click = createTool({
  id: 'click',
  description: 'Click an element on the page using its ref (e.g., @e5). Get refs from the snapshot tool first. If clicking a link, wait for navigation.',
  inputSchema: z.object({
    ref: z.string().describe('Element ref from snapshot (e.g., @e5). Get this by calling snapshot first.'),
  }),
  outputSchema: z.object({
    clicked: z.boolean(),
    newUrl: z.string().optional(),
    message: z.string(),
  }),
  execute: async ({ ref }) => {
    const { page } = await getOrLaunchBrowser();
    const el = snapshotRefs[ref];

    if (!el) {
      return { clicked: false, message: `Unknown ref: ${ref}. Take a snapshot first to get current elements.` };
    }

    try {
      console.log(`[Browser] Clicking ${ref}: <${el.tag}> "${el.text.slice(0, 50)}"`);

      if (el.selector) {
        let clicked = false;

        // Try 1: Puppeteer native click (proper mouse events — works with React/Vue)
        try {
          await page.click(el.selector, { delay: 30 });
          clicked = true;
        } catch (clickErr) {
          console.log(`[Browser] Native click failed for selector "${el.selector}", trying text fallback...`);
        }

        // Try 2: Fallback — click by text content using DOM
        if (!clicked) {
          const textToMatch = el.text.slice(0, 100);
          if (textToMatch) {
            clicked = await page.evaluate((text: string) => {
              const allElements = document.querySelectorAll('a, button, [role="button"], [role="link"]');
              for (const el of allElements) {
                if (el.textContent?.trim() === text || el.textContent?.trim().includes(text)) {
                  (el as HTMLElement).click();
                  return true;
                }
              }
              return false;
            }, textToMatch);
          }
        }

        if (!clicked) {
          return { clicked: false, message: `Could not find element ${ref} on the page. Try taking a new snapshot.` };
        }

        // Wait for potential navigation after click
        await new Promise(r => setTimeout(r, 1500));
        const newUrl = page.url();
        console.log(`[Browser] Clicked ${ref}, current URL: ${newUrl}`);

        return { clicked: true, newUrl, message: `Clicked ${ref} (${el.tag}): ${el.text.slice(0, 50)}` };
      } else {
        return { clicked: false, message: `Element ${ref} has no valid selector. Try taking a new snapshot.` };
      }
    } catch (err: any) {
      console.error(`[Browser] click error:`, err.message);
      return { clicked: false, message: `Click failed: ${err.message}` };
    }
  },
});

// ============================================================
// type — Type text into an input element by ref (uses Puppeteer native API)
// ============================================================
export const type = createTool({
  id: 'type',
  description: 'Type text into an input field using its ref (e.g., @e1). First get refs from snapshot, then type into the input ref.',
  inputSchema: z.object({
    ref: z.string().describe('Input element ref from snapshot (e.g., @e1)'),
    text: z.string().describe('Text to type into the input field'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ ref, text }) => {
    const { page } = await getOrLaunchBrowser();
    const el = snapshotRefs[ref];

    if (!el) {
      return { success: false, message: `Unknown ref: ${ref}. Take a snapshot first.` };
    }

    try {
      console.log(`[Browser] Typing "${text}" into ${ref}: <${el.tag}>`);

      if (el.selector) {
        let typed = false;

        // Try 1: Puppeteer native type (proper keyboard events — works with React/Vue)
        try {
          // First click to focus the element
          await page.click(el.selector);
          await new Promise(r => setTimeout(r, 100));
          // Clear existing value
          await page.evaluate((sel: string) => {
            const el = document.querySelector(sel) as HTMLInputElement;
            if (el) el.value = '';
          }, el.selector);
          // Puppeteer type dispatches proper keydown→keypress→input→keyup sequences
          await page.type(el.selector, text, { delay: 20 });
          typed = true;
        } catch (typeErr) {
          console.log(`[Browser] Native type failed, trying DOM fallback...`);
        }

        // Try 2: DOM fallback
        if (!typed) {
          typed = await page.evaluate(({ sel, txt }: { sel: string; txt: string }) => {
            const el = document.querySelector(sel) as HTMLInputElement;
            if (el) {
              el.focus();
              el.value = txt;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            return false;
          }, { sel: el.selector, txt: text });
        }

        if (!typed) {
          // Fallback: type into first visible input
          await page.evaluate((txt: string) => {
            const input = document.querySelector('input:not([type="hidden"]):not([disabled])') as HTMLInputElement;
            if (input) {
              input.value = txt;
              input.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }, text);
        }

        await new Promise(r => setTimeout(r, 300));
        return { success: true, message: `Typed "${text.slice(0, 50)}" into ${ref}` };
      } else {
        return { success: false, message: `Element ${ref} has no valid selector.` };
      }
    } catch (err: any) {
      console.error(`[Browser] type error:`, err.message);
      return { success: false, message: `Type failed: ${err.message}` };
    }
  },
});

// ============================================================
// press — Press a key on a focused element by ref (uses Puppeteer native API)
// ============================================================
export const press = createTool({
  id: 'press',
  description: 'Press a keyboard key on the page (e.g., "Enter" to submit a search, "Escape" to close a dialog). If a ref is provided, focuses that element first.',
  inputSchema: z.object({
    ref: z.string().default('').describe('Optional: Focus this element first before pressing the key'),
    key: z.string().describe('Key to press: "Enter", "Escape", "Tab", "ArrowDown", "ArrowUp", "Backspace", etc.'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
  }),
  execute: async ({ ref, key }) => {
    const { page } = await getOrLaunchBrowser();

    try {
      // Focus element if ref given
      if (ref) {
        const el = snapshotRefs[ref];
        if (el && el.selector) {
          try {
            await page.click(el.selector);
            await new Promise(r => setTimeout(r, 200));
          } catch {
            await page.evaluate((sel: string) => {
              const el = document.querySelector(sel) as HTMLElement;
              if (el) el.focus();
            }, el.selector);
            await new Promise(r => setTimeout(r, 200));
          }
        }
      }

      // Use Puppeteer native keyboard press (proper event sequencing)
      await page.keyboard.press(key);

      // Wait for the action to take effect
      await new Promise(r => setTimeout(r, 1000));

      return { success: true, message: `Pressed "${key}"` };
    } catch (err: any) {
      console.error(`[Browser] press error:`, err.message);
      return { success: false, message: `Press failed: ${err.message}` };
    }
  },
});

// ============================================================
// wait — Wait for a specified duration
// ============================================================
export const wait = createTool({
  id: 'wait',
  description: 'Wait for a specified amount of time (in milliseconds). Use this to wait for pages to load, videos to start, or animations to finish.',
  inputSchema: z.object({
    ms: z.number().describe('Milliseconds to wait (e.g., 2000 for 2 seconds)'),
  }),
  outputSchema: z.object({
    message: z.string(),
  }),
  execute: async ({ ms }) => {
    const ms_safe = Math.min(Math.max(ms, 100), 15000); // clamp 100ms-15s
    await new Promise(r => setTimeout(r, ms_safe));
    return { message: `Waited ${ms_safe}ms` };
  },
});

// ============================================================
// scroll — Scroll the page
// ============================================================
export const scroll = createTool({
  id: 'scroll',
  description: 'Scroll the page down or up. Use to reveal content below the fold.',
  inputSchema: z.object({
    direction: z.enum(['down', 'up']).describe('Scroll direction'),
    amount: z.number().optional().default(500).describe('Pixels to scroll (default: 500)'),
  }),
  outputSchema: z.object({
    message: z.string(),
  }),
  execute: async ({ direction, amount = 500 }) => {
    const { page } = await getOrLaunchBrowser();
    const pixels = direction === 'down' ? amount : -amount;
    await page.evaluate((p: number) => {
      window.scrollBy(0, p);
    }, pixels);
    await new Promise(r => setTimeout(r, 300));
    return { message: `Scrolled ${direction} ${Math.abs(pixels)}px` };
  },
});

// ============================================================
// Exported collection of all browser tools
// ============================================================
export const browserTools = {
  goto,
  snapshot,
  click,
  type,
  press,
  wait,
  scroll,
  stagehandAgent: stagehandAgentTool,
};
