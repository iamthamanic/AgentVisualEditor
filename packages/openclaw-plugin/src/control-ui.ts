/**
 * Control UI: chip region above mountDefault composer + health/pairing page.
 * Location: packages/openclaw-plugin/src/control-ui.ts
 *
 * DE/EN via ui-i18n. Canonical setDraft/send only (FR-019/FR-020).
 * Composer reports active session for extension targeting (C-005).
 * SLC-3: chip-region Senden wraps prepare_send → send → send_outcome (C-010/C-011).
 */

import { defineControlUiPlugin } from "openclaw/plugin-sdk/control-ui";
import { createFeatureClient } from "openclaw/plugin-sdk/feature-contract";
import { contract } from "./contract.js";
import { controlUiStrings } from "./ui-i18n.js";
import "./control-ui.css";

type ChipView = {
  id: string;
  label: string;
};

type BatchView = {
  batchId: string;
  state: string;
  selectionCount: number;
  selections: ChipView[];
};

function emptyBatch(): BatchView {
  return { batchId: "", state: "empty", selectionCount: 0, selections: [] };
}

export default defineControlUiPlugin({
  id: contract.pluginId,
  activate(host) {
    const t = controlUiStrings();

    host.ui.registerNavigation({
      id: "ave-health-nav",
      label: t.navLabel,
      page: { id: "ave-health" },
      icon: "activity",
    });

    host.ui.registerPage({
      id: "ave-health",
      label: t.pageLabel,
      mount(container) {
        const feature = createFeatureClient(contract, host);

        const section = document.createElement("section");
        section.className = "ave-health-page";

        const heading = document.createElement("h1");
        heading.textContent = t.heading;

        const status = document.createElement("p");
        status.className = "ave-health-status";
        status.textContent = t.loadingStatus;

        const hint = document.createElement("p");
        hint.className = "ave-health-hint";
        hint.textContent = t.hintNoAgentRun;

        const pairingBox = document.createElement("div");
        pairingBox.className = "ave-pairing-box";

        const pairingTitle = document.createElement("h2");
        pairingTitle.textContent = t.pairingTitle;

        const codeOut = document.createElement("output");
        codeOut.className = "ave-pairing-code";
        codeOut.setAttribute("aria-live", "polite");
        codeOut.textContent = t.pairingCodeNone;

        const pairBtn = document.createElement("button");
        pairBtn.type = "button";
        pairBtn.className = "ave-pairing-start";
        pairBtn.textContent = t.pairingStart;

        const connList = document.createElement("ul");
        connList.className = "ave-connection-list";
        connList.setAttribute("aria-label", t.pairedExtensionsAria);

        pairingBox.append(pairingTitle, codeOut, pairBtn, connList);
        section.append(heading, status, hint, pairingBox);
        container.append(section);

        let disposed = false;

        const refresh = async () => {
          try {
            const health = await feature.invoke("get_health", {});
            const connections = await feature.invoke("list_connections", {});
            if (disposed) return;
            const domscribeLabel =
              health.domscribeStatus === "available"
                ? t.domscribeAvailable
                : health.domscribeStatus === "stale"
                  ? t.domscribeStale
                  : health.domscribeStatus === "error"
                    ? t.domscribeError
                    : t.domscribeUnavailable;
            status.textContent = t.healthLine({
              bridgePath: health.bridgePath,
              session: health.activeSessionStatus,
              domscribe: domscribeLabel,
              paired: health.pairedConnectionCount,
            });

            connList.replaceChildren();
            for (const row of connections.connections) {
              if (row.revoked) continue;
              const li = document.createElement("li");
              li.className = "ave-connection-row";
              const label = document.createElement("span");
              label.textContent =
                row.extensionLabel ?? row.extensionInstanceId.slice(0, 12);
              const revoke = document.createElement("button");
              revoke.type = "button";
              revoke.textContent = t.revoke;
              revoke.onclick = async () => {
                try {
                  await feature.invoke("connection_revoke", {
                    connectionId: row.connectionId,
                  });
                  if (!disposed) await refresh();
                } catch (error) {
                  if (!disposed) {
                    status.textContent = String(error);
                  }
                }
              };
              li.append(label, revoke);
              connList.append(li);
            }
          } catch (error) {
            if (!disposed) {
              status.textContent = String(error);
            }
          }
        };

        pairBtn.onclick = async () => {
          try {
            const result = await feature.invoke("pairing_start", {
              label: t.chromeExtensionLabel,
            });
            if (disposed) return;
            if (result.ok) {
              codeOut.textContent = t.codeValidUntil(result.code, result.expiresAt);
              await refresh();
            } else {
              codeOut.textContent = result.message;
            }
          } catch (error) {
            if (!disposed) {
              codeOut.textContent = String(error);
            }
          }
        };

        void refresh();

        return {
          dispose: () => {
            disposed = true;
            section.remove();
          },
        };
      },
    });

    host.ui.registerReplacement({
      id: "ave-composer-chips",
      surface: "composer",
      label: t.composerLabel,
      mount(container, context) {
        let current = context;
        const feature = createFeatureClient(contract, context.host);

        const root = document.createElement("div");
        root.className = "ave-composer-root";

        const chipRegion = document.createElement("div");
        chipRegion.className = "ave-chip-region";
        chipRegion.setAttribute("aria-label", t.chipsAria);

        const chipList = document.createElement("div");
        chipList.className = "ave-chip-list";
        chipList.setAttribute("role", "list");

        const actions = document.createElement("div");
        actions.className = "ave-chip-actions";

        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.className = "ave-chip-clear";
        clearBtn.textContent = t.clearAll;
        clearBtn.hidden = true;

        const sendWithContextBtn = document.createElement("button");
        sendWithContextBtn.type = "button";
        sendWithContextBtn.className = "ave-chip-send";
        sendWithContextBtn.textContent = t.send;
        sendWithContextBtn.hidden = true;
        sendWithContextBtn.title = t.sendTitle;

        const testBtn = document.createElement("button");
        testBtn.type = "button";
        testBtn.className = "ave-chip-test";
        testBtn.textContent = t.testSelection;
        testBtn.hidden = true;

        const status = document.createElement("output");
        status.className = "ave-chip-status";
        status.setAttribute("aria-live", "polite");

        actions.append(clearBtn, sendWithContextBtn, testBtn);
        chipRegion.append(chipList, actions, status);
        chipRegion.hidden = true;

        const defaultHost = document.createElement("div");
        defaultHost.className = "ave-builtin-composer";
        const unmountDefault = context.mountDefault(defaultHost);
        root.append(defaultHost);
        container.append(root);

        let watchDispose: (() => void) | undefined;
        let disposed = false;
        let chipAnchor: HTMLElement | null = null;
        let shellObserver: MutationObserver | undefined;

        const placeChipRegion = (): boolean => {
          if (disposed) return true;
          const shell =
            defaultHost.querySelector<HTMLElement>(".agent-chat__composer-shell") ??
            defaultHost.querySelector<HTMLElement>(".agent-chat__composer-overlay") ??
            null;
          const anchor = shell ?? defaultHost;
          if (chipAnchor === anchor && chipRegion.parentElement === anchor) {
            return Boolean(shell);
          }
          if (shell) {
            anchor.insertBefore(chipRegion, anchor.firstChild);
          } else if (chipRegion.parentElement !== defaultHost) {
            defaultHost.insertBefore(chipRegion, defaultHost.firstChild);
          }
          chipAnchor = anchor;
          return Boolean(shell);
        };

        if (!placeChipRegion()) {
          shellObserver = new MutationObserver(() => {
            if (placeChipRegion()) {
              shellObserver?.disconnect();
              shellObserver = undefined;
            }
          });
          shellObserver.observe(defaultHost, { childList: true, subtree: true });
          let tries = 0;
          const retry = () => {
            if (disposed || placeChipRegion() || tries >= 20) return;
            tries += 1;
            requestAnimationFrame(retry);
          };
          requestAnimationFrame(retry);
        }

        const reportSession = async () => {
          try {
            await feature.invoke(
              "report_active_session",
              {
                sessionKey: current.props.sessionKey,
                agentId: current.props.agentId,
                title: null,
              },
              { sessionKey: current.props.sessionKey, agentId: current.props.agentId },
            );
          } catch {
            // Non-fatal
          }
        };

        const renderChips = (batch: BatchView) => {
          chipList.replaceChildren();
          for (const chip of batch.selections) {
            const item = document.createElement("div");
            item.className = "ave-chip";
            item.setAttribute("role", "listitem");
            const label = document.createElement("span");
            label.className = "ave-chip-label";
            label.textContent = chip.label;
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "ave-chip-remove";
            remove.setAttribute("aria-label", t.removeSelectionAria(chip.label));
            remove.textContent = "×";
            remove.onclick = async () => {
              status.textContent = "";
              try {
                const result = await feature.invoke(
                  "remove_selection",
                  {
                    sessionKey: current.props.sessionKey,
                    agentId: current.props.agentId,
                    selectionId: chip.id,
                  },
                  { sessionKey: current.props.sessionKey, agentId: current.props.agentId },
                );
                if (current.signal.aborted || disposed) return;
                if (result.ok) {
                  renderChips(result.batch);
                } else {
                  status.textContent = result.message;
                }
              } catch (error) {
                if (!current.signal.aborted && !disposed) {
                  status.textContent = String(error);
                }
              }
            };
            item.append(label, remove);
            chipList.append(item);
          }
          const hasChips = batch.selections.length > 0;
          clearBtn.hidden = !hasChips;
          sendWithContextBtn.hidden = !hasChips;
          chipRegion.hidden = !hasChips;
          placeChipRegion();
        };

        const refresh = async () => {
          try {
            const result = await feature.invoke(
              "get_visual_batch",
              {
                sessionKey: current.props.sessionKey,
                agentId: current.props.agentId,
              },
              { sessionKey: current.props.sessionKey, agentId: current.props.agentId },
            );
            if (current.signal.aborted || disposed) return;
            if (result.ok) {
              renderChips(result.batch);
            } else {
              renderChips(emptyBatch());
              status.textContent = result.message;
            }
          } catch (error) {
            if (!current.signal.aborted && !disposed) {
              status.textContent = String(error);
            }
          }
        };

        const startWatch = () => {
          watchDispose?.();
          watchDispose = feature.watch(
            "get_visual_batch",
            {
              sessionKey: current.props.sessionKey,
              agentId: current.props.agentId,
            },
            {
              sessionKey: current.props.sessionKey,
              agentId: current.props.agentId,
              events: ["visual_batch_changed"],
              onChange: (output) => {
                if (current.signal.aborted || disposed) return;
                if (output.ok) {
                  renderChips(output.batch);
                }
              },
              onError: (error) => {
                if (!current.signal.aborted && !disposed) {
                  status.textContent = error.message;
                }
              },
            },
          );
        };

        clearBtn.onclick = async () => {
          status.textContent = "";
          try {
            const result = await feature.invoke(
              "clear_visual_batch",
              {
                sessionKey: current.props.sessionKey,
                agentId: current.props.agentId,
              },
              { sessionKey: current.props.sessionKey, agentId: current.props.agentId },
            );
            if (current.signal.aborted || disposed) return;
            if (result.ok) {
              renderChips(result.batch);
            } else {
              status.textContent = result.message;
            }
          } catch (error) {
            if (!current.signal.aborted && !disposed) {
              status.textContent = String(error);
            }
          }
        };

        sendWithContextBtn.onclick = async () => {
          status.textContent = "";
          if (!current.props.canSend || current.props.sending) {
            status.textContent = current.props.disabledReason ?? t.sendNotPossible;
            return;
          }
          try {
            const prepared = await feature.invoke(
              "prepare_send",
              {
                sessionKey: current.props.sessionKey,
                agentId: current.props.agentId,
              },
              { sessionKey: current.props.sessionKey, agentId: current.props.agentId },
            );
            if (current.signal.aborted || disposed) return;
            if (!prepared.ok) {
              status.textContent = prepared.message;
              return;
            }
            renderChips(prepared.batch);
            const admitted = await current.props.send();
            const outcome = await feature.invoke(
              "send_outcome",
              {
                sessionKey: current.props.sessionKey,
                agentId: current.props.agentId,
                preparationId: prepared.preparationId,
                admitted: admitted === true,
              },
              { sessionKey: current.props.sessionKey, agentId: current.props.agentId },
            );
            if (current.signal.aborted || disposed) return;
            if (!outcome.ok) {
              status.textContent = outcome.message;
              void refresh();
              return;
            }
            renderChips(outcome.batch);
            if (!outcome.admitted) {
              status.textContent = t.sendRejected;
            }
          } catch (error) {
            if (!current.signal.aborted && !disposed) {
              status.textContent = String(error);
            }
          }
        };

        testBtn.onclick = async () => {
          status.textContent = "";
          try {
            const result = await feature.invoke(
              "attach_test_selection",
              {
                sessionKey: current.props.sessionKey,
                agentId: current.props.agentId,
                tag: "button",
                textSummary: t.testSelection,
                selector: "#ave-debug-test",
                component: "TestButton",
                file: "src/TestButton.tsx",
                line: 1,
              },
              { sessionKey: current.props.sessionKey, agentId: current.props.agentId },
            );
            if (current.signal.aborted || disposed) return;
            if (result.ok) {
              renderChips(result.batch);
              status.textContent = result.deduped ? t.selectionUpdated : t.testSelectionAdded;
            } else {
              status.textContent = result.message;
            }
          } catch (error) {
            if (!current.signal.aborted && !disposed) {
              status.textContent = String(error);
            }
          }
        };

        void feature
          .invoke("get_ui_flags", {})
          .then((flags) => {
            if (disposed || current.signal.aborted) return;
            testBtn.hidden = !flags.testSelectionEnabled;
          })
          .catch(() => {
            testBtn.hidden = true;
          });

        void reportSession();
        void refresh();
        startWatch();

        return {
          update(next) {
            const sessionChanged =
              next.props.sessionKey !== current.props.sessionKey ||
              next.props.agentId !== current.props.agentId;
            current = next;
            if (sessionChanged) {
              status.textContent = "";
              renderChips(emptyBatch());
              void reportSession();
              startWatch();
              void refresh();
            }
          },
          focus() {
            // Built-in composer owns focus via mountDefault.
          },
          dispose() {
            disposed = true;
            shellObserver?.disconnect();
            shellObserver = undefined;
            watchDispose?.();
            void feature
              .invoke(
                "report_active_session",
                {
                  sessionKey: null,
                  agentId: null,
                  title: null,
                },
                { sessionKey: current.props.sessionKey, agentId: current.props.agentId },
              )
              .catch(() => undefined);
            unmountDefault();
            root.remove();
          },
        };
      },
    });
  },
});
