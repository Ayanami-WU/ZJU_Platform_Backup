import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { eventTimestamp } from "../utils/hackathonAiX";

export default function HackathonEventPicker({ events, value, now, onChange }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const root = useRef(null);
    const trigger = useRef(null);
    const listId = useId();
    const items = [...events].sort((a, b) => {
        const startA = eventTimestamp(a.event.startAt);
        const startB = eventTimestamp(b.event.startAt);
        return (
            (Number.isFinite(startA) ? startA : Infinity) -
            (Number.isFinite(startB) ? startB : Infinity)
        );
    });
    const selected = events.find((item) => item.event.key === value);
    const close = (restoreFocus = false) => {
        setOpen(false);
        if (restoreFocus) trigger.current?.focus();
    };
    useEffect(() => {
        if (!open) return;
        const outside = (event) => {
            if (!root.current?.contains(event.target)) setOpen(false);
        };
        const escape = (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
                trigger.current?.focus();
            }
        };
        document.addEventListener("pointerdown", outside);
        document.addEventListener("keydown", escape);
        root.current?.querySelector('[aria-selected="true"]')?.focus();
        return () => {
            document.removeEventListener("pointerdown", outside);
            document.removeEventListener("keydown", escape);
        };
    }, [open]);
    return (
        <div
            ref={root}
            className="hx-event-picker"
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
            }}
        >
            <button
                ref={trigger}
                type="button"
                className="hx-picker-trigger"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listId}
                aria-label={`${t("eventWorkspace.switchEvent")}: ${selected?.event.title || ""}`}
                onClick={() => setOpen(!open)}
                onKeyDown={(event) => {
                    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
                        event.preventDefault();
                        setOpen(true);
                    }
                }}
            >
                <span>{selected?.event.title}</span>
                <ChevronDown size={16} aria-hidden="true" />
            </button>
            {open && (
                <div
                    className="hx-picker-menu"
                    id={listId}
                    role="listbox"
                    aria-label={t("eventWorkspace.switchEvent")}
                    onKeyDown={(event) => {
                        const options = [
                            ...event.currentTarget.querySelectorAll('[role="option"]'),
                        ];
                        const index = options.indexOf(document.activeElement);
                        const next = {
                            ArrowDown: (index + 1) % options.length,
                            ArrowUp: (index - 1 + options.length) % options.length,
                            Home: 0,
                            End: options.length - 1,
                        }[event.key];
                        if (next !== undefined) {
                            event.preventDefault();
                            options[next]?.focus();
                        }
                    }}
                >
                    <p className="hx-picker-heading">{t("eventWorkspace.switchEvent")}</p>
                    {items.map(({ event }) => {
                        const status =
                            eventTimestamp(event.endAt) <= now
                                ? "ended"
                                : eventTimestamp(event.startAt) <= now
                                  ? "live"
                                  : "upcoming";
                        return (
                            <button
                                type="button"
                                role="option"
                                key={event.key}
                                aria-selected={event.key === value}
                                tabIndex={event.key === value ? 0 : -1}
                                onClick={() => {
                                    close(true);
                                    if (event.key !== value) onChange(event.key);
                                }}
                            >
                                <span className="hx-picker-copy">
                                    <strong>{event.title}</strong>
                                    <span>
                                        {String(event.startAt || "")
                                            .slice(0, 10)
                                            .replaceAll("-", ".")}
                                    </span>
                                </span>
                                <span className="hx-picker-state">
                                    <span className="hx-picker-status" data-state={status}>
                                        {t(`aix.state.${status}`)}
                                    </span>
                                    <span className="hx-picker-selected" aria-hidden="true">
                                        {event.key === value && <Check size={18} />}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
