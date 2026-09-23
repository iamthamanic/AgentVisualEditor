/**
 * Control UI: chip region above mountDefault composer + health page.
 * Location: packages/openclaw-plugin/src/control-ui.ts
 *
 * German user-facing strings. Canonical setDraft/send only (FR-019/FR-020).
 */

import { defineControlUiPlugin } from "openclaw/plugin-sdk/control-ui";
import { createFeatureClient } from "openclaw/plugin-sdk/feature-contract";
import { contract } from "./contract.js";
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
    host.ui.registerNavigation({
      id: "ave-health-nav",
      label: "AVE Status",
      page: { id: "ave-health" },
      icon: "activity",
    });

    host.ui.registerPage({
      id: "ave-health",
      label: "AVE Status",
      mount(container) {
        const section = document.createElement("section");
        section.className = "ave-health-page";
        const heading = document.createElement("h1");
        heading.textContent = "Agent Visual Editor";
        const status = document.createElement("p");
        status.textContent = "Plugin aktiv. Chips erscheinen im Composer der aktuellen Session.";
        const hint = document.createElement("p");
        hint.className = "ave-health-hint";
        hint.textContent =
          "Selektion startet keinen Agent-Lauf. Nur explizites Senden löst eine Nachricht aus.";
        section.append(heading, status, hint);
        container.append(section);
        return { dispose: () => section.remove() };
      },
    });

    host.ui.registerReplacement({
      id: "ave-composer-chips",
      surface: "composer",
      label: "AVE Composer mit Chips",
      mount(container, context) {
        let current = context;
        const feature = createFeatureClient(contract, context.host);

        const root = document.createElement("div");
        root.className = "ave-composer-root";

        const chipRegion = document.createElement("div");
        chipRegion.className = "ave-chip-region";
        chipRegion.setAttribute("aria-label", "Visuelle Selektionen");

        const chipList = document.createElement("div");
        chipList.className = "ave-chip-list";
        chipList.setAttribute("role", "list");

        const actions = document.createElement("div");
        actions.className = "ave-chip-actions";

        const clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.className = "ave-chip-clear";
        clearBtn.textContent = "Alle entfernen";
        clearBtn.hidden = true;

        const testBtn = document.createElement("button");
        testBtn.type = "button";
        testBtn.className = "ave-chip-test";
        testBtn.textContent = "Test-Selektion";
        testBtn.hidden = true;

        const status = document.createElement("output");
        status.className = "ave-chip-status";
        status.setAttribute("aria-live", "polite");

        actions.append(clearBtn, testBtn);
        chipRegion.append(chipList, actions, status);

        const defaultHost = document.createElement("div");
        defaultHost.className = "ave-builtin-composer";
        const unmountDefault = context.mountDefault(defaultHost);

        root.append(chipRegion, defaultHost);
        container.append(root);

        let watchDispose: (() => void) | undefined;
        let disposed = false;

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
            remove.setAttribute("aria-label", `Selektion entfernen: ${chip.label}`);
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
          clearBtn.hidden = batch.selections.length === 0;
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

        testBtn.onclick = async () => {
          status.textContent = "";
          try {
            const result = await feature.invoke(
              "attach_test_selection",
              {
                sessionKey: current.props.sessionKey,
                agentId: current.props.agentId,
                tag: "button",
                textSummary: "Test-Selektion",
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
              status.textContent = result.deduped ? "Selektion aktualisiert" : "Test-Selektion hinzugefügt";
            } else {
              status.textContent = result.message;
            }
          } catch (error) {
            if (!current.signal.aborted && !disposed) {
              status.textContent = String(error);
            }
          }
        };

        // Debug button gated by plugin config testSelectionEnabled.
        void feature
          .invoke("get_ui_flags", {})
          .then((flags) => {
            if (disposed || current.signal.aborted) return;
            testBtn.hidden = !flags.testSelectionEnabled;
          })
          .catch(() => {
            testBtn.hidden = true;
          });

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
              startWatch();
              void refresh();
            }
          },
          focus() {
            // Built-in composer owns focus via mountDefault.
          },
          dispose() {
            disposed = true;
            watchDispose?.();
            unmountDefault();
            root.remove();
          },
        };
      },
    });
  },
});
