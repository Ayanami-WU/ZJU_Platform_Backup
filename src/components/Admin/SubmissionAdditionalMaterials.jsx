import { useTranslation } from "react-i18next";
import { safeWebUrl } from "../../utils/hackathonAiX";

export default function SubmissionAdditionalMaterials({ snapshot }) {
    const { t } = useTranslation();
    const text = (key) => t(`admin.hackathon_submissions.${key}`);
    return (
        <div className="min-w-0 space-y-3 break-words text-sm">
            {snapshot.wechat && (
                <p>
                    {text("wechat")}：{snapshot.wechat}
                </p>
            )}
            {snapshot.visitNotes && (
                <p className="whitespace-pre-wrap">
                    {text("visitNotes")}：{snapshot.visitNotes}
                </p>
            )}
            {snapshot.links?.length > 0 && (
                <ul className="space-y-1">
                    {snapshot.links.map((link, index) => {
                        const url = safeWebUrl(link.url);
                        return url ? (
                            <li key={index}>
                                <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="break-all underline"
                                >
                                    {link.label || url}
                                </a>
                            </li>
                        ) : null;
                    })}
                </ul>
            )}
            {snapshot.attachmentReferences?.length > 0 && (
                <div>
                    <p className="font-semibold">{text("attachmentsPending")}</p>
                    <ul className="space-y-1">
                        {snapshot.attachmentReferences.map((file, index) => (
                            <li key={index} className="break-all">
                                {text(file.kind === "bp" ? "bpFileId" : "demoFileId")}：{file.name}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {snapshot.reviewNote && (
                <p className="whitespace-pre-wrap">
                    {text("reviewNote")}：{snapshot.reviewNote}
                </p>
            )}
        </div>
    );
}
