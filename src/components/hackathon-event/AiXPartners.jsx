import { useTranslation } from "react-i18next";
import { useRef } from "react";
import { useAiXMobileLayout } from "../../hooks/useAiXMobileLayout";
import AiXOrganizers from "./AiXOrganizers";
import AiXPartnerLogos from "./AiXPartnerLogos";
import "./AiXOverview.css";
import "./AiXPartners.css";

export default function AiXPartners() {
    const { t } = useTranslation();
    const pageRef = useRef(null);
    useAiXMobileLayout(pageRef);
    return (
        <section
            ref={pageRef}
            id="aix-partners-title"
            className="aix-page aix-partners-page"
            aria-labelledby="aix-partners-heading"
        >
            <div className="aix-page-body">
                <header className="aix-page-heading">
                    <h2 id="aix-partners-heading">{t("aix.pages.partnersTitle")}</h2>
                </header>
                <AiXOrganizers groups={t("aix.pages.organizers", { returnObjects: true })} />
                <AiXPartnerLogos />
            </div>
        </section>
    );
}
