import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X, Gift } from "lucide-react";
import { useSettings } from "../../context/SettingsContext";
import LotteryPage from "./LotteryPage";
import "./lottery-modal.css";

export default function LotteryModal({ eventKey, eventTitle, onClose }) {
    const { t } = useTranslation();
    const { uiMode } = useSettings();
    const panel = useRef(null);
    const close = useRef(onClose);
    close.current = onClose;
    useEffect(() => {
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        const workspace = document.querySelector(".hx-workspace");
        const wasInert = workspace?.inert;
        if (workspace) workspace.inert = true;
        document.body.style.overflow = "hidden";
        panel.current?.querySelector("button")?.focus();
        const escape = (event) => {
            if (event.key === "Escape") {
                event.stopPropagation();
                close.current();
            }
        };
        document.addEventListener("keydown", escape);
        return () => {
            document.removeEventListener("keydown", escape);
            if (workspace) workspace.inert = wasInert;
            document.body.style.overflow = previousOverflow;
            previousFocus?.focus();
        };
    }, []);
    const handleKey = (event) => {
        if (event.key !== "Tab") return;
        const elements = [
            ...panel.current.querySelectorAll(
                'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]'
            ),
        ].filter((element) => element.getClientRects().length);
        const first = elements[0],
            last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
        }
    };
    return createPortal(
        <div className="lottery-modal-overlay" data-theme={uiMode}>
            <section
                ref={panel}
                className="lottery-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="lottery-modal-title"
                onKeyDown={handleKey}
            >
                <header className="lottery-modal-bar">
                    <h2 id="lottery-modal-title">
                        <Gift size={20} />
                        {t("lottery.event_entry")}
                    </h2>
                    <button type="button" aria-label={t("common.close")} onClick={onClose}>
                        <X size={22} />
                    </button>
                </header>
                <div className="lottery-modal-content">
                    <LotteryPage
                        eventKey={eventKey}
                        eventTitle={eventTitle}
                        embedded
                        onLogin={() => {
                            onClose();
                            window.dispatchEvent(new Event("open-auth-modal"));
                        }}
                    />
                </div>
            </section>
        </div>,
        document.body
    );
}
