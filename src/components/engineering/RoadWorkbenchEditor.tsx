"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import type { RoadDesignData, CrossSectionTemplate } from "@/types/engineering";
import { canonicalJSON } from "@/lib/audit/auditHash";
import type { QuantityReference } from "@/lib/engineering/roadQuantity";
import {
  createRoadWorkbenchDraft,
  evaluateRoadWorkbenchDraft,
  type RoadPiDraft,
  type RoadVipDraft,
} from "@/lib/engineering/roadWorkbenchDraft";
import RoadWorkbench from "./RoadWorkbench";

const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded border border-[var(--border-color)] px-3 py-2 text-xs hover:bg-[var(--bg-secondary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:opacity-40";
const input =
  "mt-1 min-h-11 w-full min-w-0 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-2 font-mono text-sm text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]";
type Props = {
  projectId?: string;
  road: RoadDesignData | null;
  reference: QuantityReference;
  disabled?: boolean;
  onSave?: (road: RoadDesignData) => Promise<boolean>;
};
type EditorTab = "horizontal" | "vertical" | "template";
const keyOf = (road: RoadDesignData | null, reference: QuantityReference) =>
  canonicalJSON(JSON.parse(JSON.stringify({ road, reference })));
function session(road: RoadDesignData, reference: QuantityReference) {
  const draft = createRoadWorkbenchDraft(road);
  return {
    observedKey: keyOf(road, reference),
    base: road,
    reference,
    draft,
    cleanKey: canonicalJSON(draft),
  };
}

/** A single editable source feeds all views. Saving requires an exact project acknowledgement upstream. */
export default function RoadWorkbenchEditor(props: Props) {
  const readable = useMemo(() => {
    if (!props.road) return true;
    try {
      createRoadWorkbenchDraft(props.road);
      return true;
    } catch {
      return false;
    }
  }, [props.road]);
  if (!readable)
    return (
      <div role="alert" className="border-l-2 border-amber-500 p-4 text-sm">
        The saved road inputs need repair before live editing. The original
        saved data is retained.{" "}
        {props.projectId && (
          <a
            className="underline"
            href={`/project/${encodeURIComponent(props.projectId)}/engineering?tab=workflow`}
          >
            Open input workflow
          </a>
        )}
      </div>
    );
  if (!props.road)
    return (
      <RoadWorkbench
        projectId={props.projectId}
        road={null}
        reference={props.reference}
      />
    );
  return (
    <Editor
      key={props.projectId ?? "synthetic-example"}
      {...props}
      road={props.road}
    />
  );
}
function Editor({
  projectId,
  road,
  reference,
  onSave,
  disabled = false,
}: Props & { road: RoadDesignData }) {
  const [state, setState] = useState(() => session(road, reference));
  const [tab, setTab] = useState<EditorTab>("horizontal");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  const inFlight = useRef(false);
  const incoming = keyOf(road, reference);
  const latest = useRef(incoming);
  latest.current = incoming;
  const dirty = canonicalJSON(state.draft) !== state.cleanKey;
  const conflict = incoming !== state.observedKey;
  // A clean view follows newly loaded saved inputs; a dirty view retains its source until explicit discard.
  if (conflict && !dirty && !saving) setState(session(road, reference));
  const evaluated = useMemo(
    () => evaluateRoadWorkbenchDraft(state.base, state.draft, state.reference),
    [state.base, state.draft, state.reference],
  );
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const holdNavigation = (e: MouseEvent) => {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const anchor = e.target instanceof Element ? e.target.closest("a") : null;
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      )
        return;
      const destination = new URL(anchor.href, window.location.href);
      if (
        destination.origin === window.location.origin &&
        destination.pathname === window.location.pathname &&
        destination.search === window.location.search
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      setFeedback({
        error: true,
        text: "Save or discard the local changes before leaving this design. Your current inputs are retained here.",
      });
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", holdNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", holdNavigation, true);
    };
  }, [dirty]);
  const edit = (update: (draft: typeof state.draft) => typeof state.draft) => {
    if (inFlight.current || disabled) return;
    setFeedback(null);
    setState((old) => ({ ...old, draft: update(old.draft) }));
  };
  const updatePi = <K extends keyof RoadPiDraft>(
    i: number,
    field: K,
    value: RoadPiDraft[K],
  ) =>
    edit((d) => ({
      ...d,
      ips: d.ips.map((p, n) =>
        n === i
          ? {
              ...p,
              [field]: value,
              ...(field === "hasTransition" && value === false
                ? { transitionLengthIn: "", transitionLengthOut: "" }
                : {}),
            }
          : p,
      ),
    }));
  const updateVip = (i: number, field: keyof RoadVipDraft, value: string) =>
    edit((d) => ({
      ...d,
      vips: d.vips.map((p, n) => (n === i ? { ...p, [field]: value } : p)),
    }));
  const discard = () => {
    if (inFlight.current) return;
    setState(session(road, reference));
    setFeedback(null);
  };
  const save = async () => {
    if (
      !onSave ||
      inFlight.current ||
      disabled ||
      !dirty ||
      conflict ||
      !evaluated.road
    )
      return;
    const submitted = evaluated.road;
    const submittedKey = keyOf(submitted, state.reference);
    const observed = state.observedKey;
    inFlight.current = true;
    setSaving(true);
    setFeedback(null);
    try {
      if ((await onSave(submitted)) !== true)
        throw new Error(
          "Road draft save is unconfirmed. Your inputs remain here; recover the saved project before retrying.",
        );
      if (latest.current !== observed && latest.current !== submittedKey)
        throw new Error(
          "The saved source changed during this save. Your inputs remain here; recover the saved project before retrying.",
        );
      setState((old) => ({
        ...old,
        base: submitted,
        observedKey: latest.current,
        cleanKey: canonicalJSON(old.draft),
      }));
      setFeedback({
        error: false,
        text: "Road draft saved. Review delivery schedules separately before issue.",
      });
    } catch (cause) {
      setFeedback({
        error: true,
        text:
          cause instanceof Error
            ? cause.message
            : "Road draft save is unconfirmed. Your inputs remain here.",
      });
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };
  const fields: Array<[keyof CrossSectionTemplate, string]> = [
    ["carriagewayWidth", "Carriageway width (m)"],
    ["shoulderWidth", "Shoulder width (m)"],
    ["camber", "Camber (%)"],
    ["shoulderCrossfall", "Shoulder crossfall (%, optional)"],
    ["subgradeDepth", "Subgrade depth (m)"],
    ["cutSlope", "Cut slope (H:V)"],
    ["fillSlope", "Fill slope (H:V)"],
  ];
  const status = saving
    ? "Saving road draft…"
    : feedback && !feedback.error
      ? feedback.text
      : dirty
        ? projectId
          ? "Unsaved road changes. Save before leaving this page."
          : "Unsaved example changes. Reset or reload to restore the synthetic example."
        : projectId
          ? "Saved project inputs. Changes update the views before saving."
          : "Synthetic example inputs. Changes stay in this page and are never saved to a project.";
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[var(--border-color)] py-3">
        <p
          role="status"
          aria-label="Road edit status"
          className="max-w-prose text-sm text-[var(--text-secondary)]"
        >
          {status}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={button}
            onClick={discard}
            disabled={saving || (!dirty && !conflict)}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {projectId ? "Discard local changes" : "Reset example"}
          </button>
          {onSave && (
            <button
              type="button"
              className={button}
              disabled={
                disabled || saving || !dirty || conflict || !evaluated.road
              }
              onClick={() => void save()}
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {saving ? "Saving…" : "Save road draft"}
            </button>
          )}
        </div>
      </div>
      {(conflict && !saving) || feedback?.error ? (
        <p role="alert" className="border-l-2 border-amber-500 pl-3 text-sm">
          {conflict && !saving
            ? "The saved source changed while you were editing. Local inputs are retained. Review the saved project before discarding or transferring your changes; saving is blocked."
            : feedback?.text}
        </p>
      ) : null}
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside
          aria-label="Live road design inputs"
          className="min-w-0 rounded border border-[var(--border-color)] p-3"
        >
          <h2 className="text-sm font-semibold">Design inputs</h2>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Edit supplied design values. Ground observations keep their original
            station chainages and profiles. An alignment change can require new
            field sections.
          </p>
          <nav
            aria-label="Design input groups"
            className="my-3 flex flex-wrap gap-1"
          >
            {(
              [
                ["horizontal", "Alignment inputs"],
                ["vertical", "Vertical profile inputs"],
                ["template", "Section template inputs"],
              ] as const
            ).map(([id, label]) => (
              <button
                type="button"
                key={id}
                className={`${button} ${tab === id ? "bg-[var(--bg-secondary)] font-semibold" : ""}`}
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <fieldset disabled={saving || disabled} className="min-w-0 space-y-3">
            <legend className="sr-only">{tab} design inputs</legend>
            {tab === "horizontal" && (
              <>
                <Field
                  label="Start chainage (m)"
                  value={state.draft.startChainage}
                  onChange={(v) => edit((d) => ({ ...d, startChainage: v }))}
                />
                <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
                  {state.draft.ips.map((p, i) => (
                    <InputRow
                      key={p.id}
                      title={`PI ${i + 1}`}
                      remove={() =>
                        edit((d) => ({
                          ...d,
                          ips: d.ips.filter((_, n) => n !== i),
                        }))
                      }
                    >
                      <div className="grid min-w-0 gap-2 sm:grid-cols-2 2xl:grid-cols-1">
                        {(
                          [
                            ["name", "Name"],
                            ["easting", "Easting (m)"],
                            ["northing", "Northing (m)"],
                            ["radius", "Radius (m)"],
                          ] as const
                        ).map(([field, label]) => (
                          <Field
                            key={field}
                            label={`PI ${i + 1} ${label}`}
                            value={p[field]}
                            onChange={(v) => updatePi(i, field, v)}
                            numeric={field !== "name"}
                          />
                        ))}
                      </div>
                      <label className="mt-3 flex min-h-11 items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={p.hasTransition}
                          onChange={(e) =>
                            updatePi(i, "hasTransition", e.target.checked)
                          }
                        />
                        Use supplied transition spirals at PI {i + 1}
                      </label>
                      {p.hasTransition && (
                        <div className="space-y-2">
                          <Field
                            label={`PI ${i + 1} Entry spiral (m)`}
                            value={p.transitionLengthIn}
                            onChange={(v) =>
                              updatePi(i, "transitionLengthIn", v)
                            }
                          />
                          <Field
                            label={`PI ${i + 1} Exit spiral (m)`}
                            value={p.transitionLengthOut}
                            onChange={(v) =>
                              updatePi(i, "transitionLengthOut", v)
                            }
                          />
                          <p className="text-xs text-[var(--text-secondary)]">
                            Equal supplied entry/exit lengths are supported. No
                            transition length is inferred.
                          </p>
                        </div>
                      )}
                    </InputRow>
                  ))}
                </div>
                <button
                  type="button"
                  className={button}
                  disabled={state.draft.ips.length >= 1000}
                  onClick={() =>
                    edit((d) => ({
                      ...d,
                      ips: [
                        ...d.ips,
                        {
                          id: crypto.randomUUID(),
                          name: "",
                          easting: "",
                          northing: "",
                          radius: "",
                          hasTransition: false,
                          transitionLengthIn: "",
                          transitionLengthOut: "",
                        },
                      ],
                    }))
                  }
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add alignment point
                </button>
              </>
            )}
            {tab === "vertical" && (
              <>
                <p className="text-xs text-[var(--text-secondary)]">
                  VIP levels are tangent intersection levels. Curve length or K
                  must be supplied at a grade break; no design approval is
                  inferred.
                </p>
                <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
                  {state.draft.vips.map((p, i) => (
                    <InputRow
                      key={p.id}
                      title={`VIP ${i + 1}`}
                      remove={() =>
                        edit((d) => ({
                          ...d,
                          vips: d.vips.filter((_, n) => n !== i),
                        }))
                      }
                    >
                      {(
                        [
                          ["chainage", "Chainage (m)"],
                          ["reducedLevel", "Tangent intersection RL (m)"],
                          ["curveLength", "Curve length (m, optional)"],
                          ["kValue", "K (m/%, optional)"],
                        ] as const
                      ).map(([field, label]) => (
                        <Field
                          key={field}
                          label={`VIP ${i + 1} ${label}`}
                          value={p[field]}
                          onChange={(v) => updateVip(i, field, v)}
                        />
                      ))}
                    </InputRow>
                  ))}
                </div>
                <Field
                  label="Design profile interval (m, optional)"
                  value={state.draft.verticalStationIntervalM}
                  onChange={(v) =>
                    edit((d) => ({ ...d, verticalStationIntervalM: v }))
                  }
                />
                <button
                  type="button"
                  className={button}
                  disabled={state.draft.vips.length >= 1000}
                  onClick={() =>
                    edit((d) => ({
                      ...d,
                      vips: [
                        ...d.vips,
                        {
                          id: crypto.randomUUID(),
                          chainage: "",
                          reducedLevel: "",
                          curveLength: "",
                          kValue: "",
                        },
                      ],
                    }))
                  }
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add vertical point
                </button>
              </>
            )}
            {tab === "template" && (
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
                {fields.map(([field, label]) => (
                  <Field
                    key={field}
                    label={label}
                    value={state.draft.template[field]}
                    numeric={!["cutSlope", "fillSlope"].includes(field)}
                    onChange={(v) =>
                      edit((d) => ({
                        ...d,
                        template: { ...d.template, [field]: v },
                      }))
                    }
                  />
                ))}
              </div>
            )}
          </fieldset>
        </aside>
        <div className="min-w-0">
          {evaluated.error ? (
            <div
              role="alert"
              className="space-y-2 border-l-2 border-amber-500 p-4"
            >
              <h2 className="font-semibold">Review design inputs</h2>
              <p className="text-sm">{evaluated.error}</p>
              <p className="text-xs text-[var(--text-secondary)]">
                Current inputs are retained. Correct them to recalculate the
                views. The previous design is not shown as the current result.
              </p>
            </div>
          ) : (
            <RoadWorkbench
              projectId={projectId}
              road={evaluated.road}
              reference={state.reference}
              sourceLabel={dirty ? "Unsaved design · live preview" : undefined}
            />
          )}
        </div>
      </div>
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
  numeric = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
}) {
  return (
    <label className="mb-3 block min-w-0 text-xs text-[var(--text-secondary)] last:mb-0">
      {label}
      <input
        type="text"
        inputMode={numeric ? "decimal" : undefined}
        aria-label={label}
        className={input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
    </label>
  );
}
function InputRow({
  title,
  remove,
  children,
}: {
  title: string;
  remove: () => void;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded border border-[var(--border-color)] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold">{title}</h3>
        <button
          type="button"
          aria-label={`Remove ${title}`}
          className={button}
          onClick={remove}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">Remove</span>
        </button>
      </div>
      {children}
    </section>
  );
}
