import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Award,
    Calendar,
    CheckCircle,
    ExternalLink,
    Filter,
    RefreshCw,
    Search,
    Sparkles,
    Trash2,
    Users,
    XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";

import { AIX_EVENT_KEY, registrationOpen } from "../../utils/hackathonAiX";
import { getEventUrl } from "../../utils/hackathonRoute";
import api from "../../services/api";
import {
    AdminButton,
    AdminEmptyState,
    AdminIconButton,
    AdminLoadingState,
    AdminMetricCard,
    AdminPageShell,
    AdminPanel,
    AdminTableCellText,
    AdminTableShell,
    AdminToolbar,
    ConfirmDialog,
    FilterChip,
    StatusBadge,
    ToolbarGroup,
    useAdminTheme,
} from "./AdminUI";
import HackathonTemplateEditor from "./HackathonTemplateEditor";
import HackathonSubmissionManager from "./HackathonSubmissionManager";
import HackathonRegistrationWorkspace from "./HackathonRegistrationWorkspace";
import { activeRegistrationTracks } from "../../utils/hackathonRoster";
import { attachRegistrationSubmissions } from "../../utils/hackathonRegistrationSubmissions";

const workStatusLabels = {
    all: "全部状态",
    pending: "待审核",
    approved: "已通过",
    rejected: "已驳回",
};

const formatNumber = (value) => new Intl.NumberFormat("zh-CN").format(Number(value || 0));

const HackathonManager = () => {
    const { t } = useTranslation();
    const { isDayMode, headingTextClass, mutedTextClass } = useAdminTheme();
    const [registrations, setRegistrations] = useState([]);
    const [submissionRoster, setSubmissionRoster] = useState(null);
    const registrationsWithSubmissions = useMemo(
        () => attachRegistrationSubmissions(registrations, submissionRoster),
        [registrations, submissionRoster]
    );
    const [works, setWorks] = useState([]);
    const [mediaLinks, setMediaLinks] = useState([]);
    const [confirmState, setConfirmState] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [workSearchTerm, setWorkSearchTerm] = useState("");
    const [workStatusFilter, setWorkStatusFilter] = useState("all");
    const [workCompetitionFilter, setWorkCompetitionFilter] = useState("");
    const [scheduleConfig, setScheduleConfig] = useState(null);
    const [activeWorkspace, setActiveWorkspace] = useState("overview");
    const [selectedEventKey, setSelectedEventKey] = useState("");
    const [competitions, setCompetitions] = useState([]);
    const [templateSection, setTemplateSection] = useState("event");
    const [featuredFilter, setFeaturedFilter] = useState("all");
    const [workEdit, setWorkEdit] = useState({});
    const [mediaCompetitionFilter, setMediaCompetitionFilter] = useState("");

    const handleTemplateChange = useCallback((template, schedule) => {
        setScheduleConfig(schedule);
        setSelectedEventKey(template.event.key);
    }, []);

    const selectedEvent = scheduleConfig?.events?.find(
        (item) => item.event.key === selectedEventKey
    );
    const selectedCompetition = competitions.find(
        (item) => item.slug === selectedEvent?.results.competitionSlug
    );
    useEffect(() => {
        if (selectedEventKey !== AIX_EVENT_KEY) {
            setActiveWorkspace((current) => (current === "submissions" ? "overview" : current));
        }
        const id = selectedCompetition ? String(selectedCompetition.id) : "__none__";
        setWorkCompetitionFilter(id);
        setMediaCompetitionFilter(id);
    }, [selectedEventKey, selectedCompetition?.id]);
    const configure = (section) => {
        setTemplateSection(section);
        setActiveWorkspace("template");
    };

    const fetchRegistrations = async () => {
        const response = await api.get("/admin/hackathon/registrations", {
            params: { includeWithdrawn: "1" },
        });
        setRegistrations(Array.isArray(response.data) ? response.data : []);
    };

    const fetchWorks = async () => {
        const response = await api.get("/admin/competition-works", {
            params: { status: "all" },
        });
        setWorks(Array.isArray(response.data) ? response.data : []);
    };

    const fetchMediaLinks = async () => {
        const response = await api.get("/admin/competition-media-links");
        setMediaLinks(Array.isArray(response.data) ? response.data : []);
    };

    const refreshAll = async () => {
        setLoading(true);
        try {
            const [, , , scheduleResponse, competitionResponse] = await Promise.all([
                fetchRegistrations(),
                fetchWorks(),
                fetchMediaLinks(),
                api.get("/admin/hackathon/schedule"),
                api.get("/admin/competitions"),
                api
                    .get("/admin/hackathon/submissions", { params: { event: AIX_EVENT_KEY } })
                    .then((response) => setSubmissionRoster(response.data))
                    .catch(() => {
                        setSubmissionRoster(null);
                        toast.error(t("admin.hackathon_submissions.load_failed"));
                    }),
            ]);
            setScheduleConfig(scheduleResponse.data);
            setCompetitions(competitionResponse.data);
            setSelectedEventKey((current) => current || scheduleResponse.data.activeEventKey);
        } catch (error) {
            toast.error(error.response?.data?.error || "加载黑客松运营数据失败");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refreshAll();
    }, []);

    const filteredWorks = useMemo(() => {
        const query = workSearchTerm.trim().toLowerCase();
        return works.filter((work) => {
            const matchesStatus = workStatusFilter === "all" || work.status === workStatusFilter;
            const matchesCompetition = workCompetitionFilter
                ? String(work.competition_id) === workCompetitionFilter
                : true;
            const matchesSearch =
                !query ||
                [
                    work.title,
                    work.author,
                    work.summary,
                    work.award,
                    work.rank,
                    work.honor_title,
                    work.highlight,
                    work.experience,
                    work.uploader_name,
                    work.competition_title,
                ]
                    .map((value) => String(value || "").toLowerCase())
                    .some((value) => value.includes(query));

            const matchesFeatured =
                featuredFilter === "all" ||
                (featuredFilter === "featured" ? work.featured : !work.featured);
            return matchesStatus && matchesCompetition && matchesSearch && matchesFeatured;
        });
    }, [workCompetitionFilter, workSearchTerm, workStatusFilter, featuredFilter, works]);

    const registrationTotal = registrationsWithSubmissions.filter(
        (row) =>
            row.event_key === selectedEventKey &&
            (row.event_key !== AIX_EVENT_KEY || activeRegistrationTracks(row).length > 0)
    ).length;

    const workStats = useMemo(() => {
        const scopedWorks = works.filter(
            (work) => String(work.competition_id) === workCompetitionFilter
        );
        const byStatus = scopedWorks.reduce((accumulator, work) => {
            const status = work.status || "unknown";
            accumulator[status] = (accumulator[status] || 0) + 1;
            return accumulator;
        }, {});

        return {
            total: scopedWorks.length,
            featured: scopedWorks.filter(
                (work) => work.featured && work.status === "approved" && work.public_consent
            ).length,
            filtered: filteredWorks.length,
            pending: byStatus.pending || 0,
            approved: byStatus.approved || 0,
            rejected: byStatus.rejected || 0,
        };
    }, [filteredWorks.length, works, workCompetitionFilter]);

    const deleteConfirmed = async () => {
        if (!confirmState) return;
        setSaving(true);
        try {
            await api.delete(`/admin/hackathon/registrations/${confirmState.id}`);
            await fetchRegistrations();
            toast.success("报名记录已删除");
            setConfirmState(null);
        } catch (error) {
            toast.error(error.response?.data?.error || "删除失败");
        } finally {
            setSaving(false);
        }
    };

    const reviewWork = async (work, status) => {
        setSaving(true);
        try {
            await api.put(`/admin/competition-works/${work.id}/review`, {
                status,
                reason: status === "rejected" ? "管理员驳回" : "",
            });
            await fetchWorks();
            toast.success(status === "approved" ? "作品已通过审核" : "作品已驳回");
        } catch (error) {
            toast.error(error.response?.data?.error || "作品审核失败");
        } finally {
            setSaving(false);
        }
    };

    const saveWorkResult = async (work) => {
        const values = workEdit[work.id] || { rank: work.rank || "", award: work.award || "" };
        setSaving(true);
        try {
            await api.put(`/admin/competition-works/${work.id}`, {
                rank: values.rank,
                award: values.award,
            });
            await fetchWorks();
            toast.success(t("admin.hackathon_manager.results.saved"));
        } catch (error) {
            toast.error(
                error.response?.data?.error || t("admin.hackathon_manager.results.save_failed")
            );
        } finally {
            setSaving(false);
        }
    };

    const toggleWorkFeatured = async (work) => {
        setSaving(true);
        try {
            await api.put(`/admin/competition-works/${work.id}/featured`, {
                featured: !work.featured,
            });
            await fetchWorks();
            toast.success(
                t(
                    work.featured
                        ? "admin.hackathon_manager.selection.removed"
                        : "admin.hackathon_manager.selection.published"
                )
            );
        } catch (error) {
            toast.error(
                error.response?.data?.error || t("admin.hackathon_manager.selection.failed")
            );
        } finally {
            setSaving(false);
        }
    };

    const toggleMediaHighlight = async (media, nextRole) => {
        setSaving(true);
        try {
            await api.put(`/admin/competition-media-links/${media.id}/role`, {
                role: nextRole || (media.role === "highlight" ? "archive" : "highlight"),
            });
            await fetchMediaLinks();
            toast.success(
                media.role === "highlight"
                    ? t("admin.hackathon_manager.media.removed")
                    : t("admin.hackathon_manager.media.featured")
            );
        } catch (error) {
            toast.error(
                error.response?.data?.error || t("admin.hackathon_manager.media.update_failed")
            );
        } finally {
            setSaving(false);
        }
    };

    const reviewMedia = async (media, status) => {
        setSaving(true);
        try {
            await api.put(
                `/${media.resource_type === "photo" ? "photos" : "videos"}/${media.resource_id}/status`,
                { status }
            );
            await fetchMediaLinks();
            toast.success(t("admin.hackathon_manager.media.review_saved"));
        } catch (error) {
            toast.error(
                error.response?.data?.error || t("admin.hackathon_manager.media.update_failed")
            );
        } finally {
            setSaving(false);
        }
    };

    const filteredMediaLinks = useMemo(
        () =>
            mediaLinks.filter(
                (media) =>
                    !mediaCompetitionFilter ||
                    String(media.competition_id) === mediaCompetitionFilter
            ),
        [mediaCompetitionFilter, mediaLinks]
    );

    const renderWorkCards = () => (
        <div className="grid gap-3 xl:grid-cols-2">
            {filteredWorks.map((work) => (
                <article
                    key={work.id}
                    className={`rounded-2xl border p-4 ${
                        isDayMode
                            ? "border-slate-200/70 bg-white/[0.78]"
                            : "border-white/10 bg-white/[0.03]"
                    }`}
                >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <StatusBadge
                                    status={work.status}
                                    label={workStatusLabels[work.status] || work.status}
                                />
                                {work.competition_title ? (
                                    <span
                                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                            isDayMode
                                                ? "bg-indigo-50 text-indigo-700"
                                                : "bg-indigo-500/15 text-indigo-100"
                                        }`}
                                    >
                                        {work.competition_title}
                                    </span>
                                ) : null}
                                {work.award ? (
                                    <span
                                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                            isDayMode
                                                ? "bg-cyan-50 text-cyan-700"
                                                : "bg-cyan-500/15 text-cyan-100"
                                        }`}
                                    >
                                        {work.award}
                                    </span>
                                ) : null}
                            </div>
                            <h3
                                className={`mt-3 line-clamp-2 text-lg font-black ${headingTextClass}`}
                            >
                                {work.title || "未命名作品"}
                            </h3>
                            <p className={`mt-1 text-sm ${mutedTextClass}`}>
                                {[
                                    work.author,
                                    work.honor_title,
                                    work.rank ? `Rank ${work.rank}` : "",
                                ]
                                    .filter(Boolean)
                                    .join(" · ") || "未填写作者"}
                            </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                            {work.git_url ? (
                                <a
                                    href={work.git_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="theme-button-ghost inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-xl border border-white/10 px-3 text-xs font-semibold"
                                >
                                    项目
                                    <ExternalLink size={14} />
                                </a>
                            ) : null}
                            <AdminButton
                                tone={work.featured ? "subtle" : "primary"}
                                disabled={
                                    saving ||
                                    (!work.featured &&
                                        (work.status !== "approved" || !work.public_consent))
                                }
                                onClick={() => toggleWorkFeatured(work)}
                            >
                                <Sparkles size={14} />
                                {t(
                                    work.featured
                                        ? "admin.hackathon_manager.selection.remove"
                                        : "admin.hackathon_manager.selection.feature"
                                )}
                            </AdminButton>
                            <AdminButton
                                tone="success"
                                className="min-h-[36px] px-3 text-xs"
                                disabled={saving || work.status === "approved"}
                                onClick={() => reviewWork(work, "approved")}
                            >
                                <CheckCircle size={14} />
                                通过
                            </AdminButton>
                            <AdminButton
                                tone="danger"
                                className="min-h-[36px] px-3 text-xs"
                                disabled={saving || work.status === "rejected"}
                                onClick={() => reviewWork(work, "rejected")}
                            >
                                <XCircle size={14} />
                                驳回
                            </AdminButton>
                        </div>
                    </div>
                    <div className="mt-4 grid gap-2 border-t border-white/10 pt-3 sm:grid-cols-[120px_minmax(0,1fr)_auto]">
                        <label className={`grid gap-1 text-xs font-semibold ${mutedTextClass}`}>
                            {t("admin.hackathon_manager.results.rank")}
                            <input
                                value={workEdit[work.id]?.rank ?? work.rank ?? ""}
                                onChange={(event) =>
                                    setWorkEdit((current) => ({
                                        ...current,
                                        [work.id]: {
                                            rank: event.target.value,
                                            award: current[work.id]?.award ?? work.award ?? "",
                                        },
                                    }))
                                }
                                placeholder={t("admin.hackathon_manager.results.rank_placeholder")}
                                className="theme-admin-input min-h-[38px] rounded-xl px-3"
                            />
                        </label>
                        <label className={`grid gap-1 text-xs font-semibold ${mutedTextClass}`}>
                            {t("admin.hackathon_manager.results.award")}
                            <input
                                value={workEdit[work.id]?.award ?? work.award ?? ""}
                                onChange={(event) =>
                                    setWorkEdit((current) => ({
                                        ...current,
                                        [work.id]: {
                                            rank: current[work.id]?.rank ?? work.rank ?? "",
                                            award: event.target.value,
                                        },
                                    }))
                                }
                                placeholder={t("admin.hackathon_manager.results.award_placeholder")}
                                className="theme-admin-input min-h-[38px] rounded-xl px-3"
                            />
                        </label>
                        <AdminButton
                            tone="primary"
                            className="self-end"
                            disabled={saving}
                            onClick={() => saveWorkResult(work)}
                        >
                            {t("admin.hackathon_manager.results.save")}
                        </AdminButton>
                    </div>
                    {work.highlight ? (
                        <p
                            className={`mt-4 border-l-2 pl-3 text-sm font-semibold leading-6 ${
                                isDayMode
                                    ? "border-cyan-400 text-slate-700"
                                    : "border-cyan-300 text-cyan-100/84"
                            }`}
                        >
                            {work.highlight}
                        </p>
                    ) : null}
                    <p className={`mt-3 line-clamp-3 text-sm leading-6 ${mutedTextClass}`}>
                        {work.summary || "暂无作品简介"}
                    </p>
                    {work.experience ? (
                        <p className={`mt-2 line-clamp-2 text-xs leading-5 ${mutedTextClass}`}>
                            经验：{work.experience}
                        </p>
                    ) : null}
                </article>
            ))}
        </div>
    );

    if (loading) {
        return <AdminLoadingState text="正在加载黑客松报名数据..." />;
    }

    return (
        <>
            <AdminPageShell
                title="黑客松运营管理"
                description={`统一维护赛事页面、赛制和报名表单；当前报名 ${formatNumber(registrationTotal)} 条，待审作品 ${formatNumber(workStats.pending)} 条。`}
                actions={
                    <>
                        <AdminButton tone="subtle" onClick={refreshAll}>
                            <RefreshCw size={16} />
                            刷新
                        </AdminButton>
                    </>
                }
                toolbar={
                    <div
                        className="flex flex-wrap gap-2"
                        role="tablist"
                        aria-label={t("admin.hackathon_manager.navigation")}
                    >
                        {[
                            ["overview", t("admin.hackathon_manager.flow.title")],
                            ["template", t("admin.hackathon_manager.tabs.template")],
                            ["registrations", t("admin.hackathon_manager.tabs.registrations")],
                            ...(selectedEventKey === AIX_EVENT_KEY
                                ? [["submissions", t("admin.hackathon_submissions.title")]]
                                : []),
                            [
                                "works",
                                t("admin.hackathon_manager.tabs.works", {
                                    count: formatNumber(workStats.pending),
                                }),
                            ],
                            ["media", t("admin.hackathon_manager.tabs.media")],
                        ].map(([id, label]) => (
                            <FilterChip
                                key={id}
                                role="tab"
                                aria-selected={activeWorkspace === id}
                                active={activeWorkspace === id}
                                onClick={() => setActiveWorkspace(id)}
                            >
                                {label}
                            </FilterChip>
                        ))}
                    </div>
                }
            >
                {activeWorkspace !== "template" && (
                    <label className="flex flex-wrap items-center gap-3 text-sm">
                        {t("admin.hackathon_manager.flow.event")}
                        <select
                            className="theme-admin-input min-h-11 max-w-full rounded-xl px-3 py-2"
                            value={selectedEventKey}
                            onChange={(event) => setSelectedEventKey(event.target.value)}
                        >
                            {(scheduleConfig?.events || []).map(({ event }) => (
                                <option key={event.key} value={event.key}>
                                    {event.title}
                                </option>
                            ))}
                        </select>
                        {selectedEvent && (
                            <a
                                className="text-cyan-500 underline underline-offset-4"
                                target="_blank"
                                rel="noreferrer"
                                href={getEventUrl(selectedEventKey)}
                            >
                                {t("admin.hackathon_manager.flow.preview")}
                            </a>
                        )}
                    </label>
                )}
                {activeWorkspace === "overview" && selectedEvent && (
                    <AdminPanel
                        title={t("admin.hackathon_manager.flow.title")}
                        description={t("admin.hackathon_manager.flow.description")}
                    >
                        <div className="divide-y divide-slate-500/20">
                            {[
                                ["setup", "event", null, selectedEvent.event.title],
                                [
                                    "registration",
                                    "form",
                                    "registrations",
                                    t(
                                        registrationOpen(selectedEvent)
                                            ? "admin.hackathon_manager.flow.open"
                                            : "admin.hackathon_manager.flow.closed"
                                    ),
                                ],
                                [
                                    "challenges",
                                    "program",
                                    null,
                                    t("admin.hackathon_manager.flow.challengeCount", {
                                        count: (
                                            selectedEvent.event.program?.challenges || []
                                        ).filter((item) => item.published).length,
                                    }),
                                ],
                                [
                                    "media",
                                    null,
                                    "media",
                                    t("admin.hackathon_manager.flow.mediaCount", {
                                        count: filteredMediaLinks.length,
                                    }),
                                ],
                                [
                                    "results",
                                    "event",
                                    "works",
                                    t("admin.hackathon_manager.flow.workCount", {
                                        count: workStats.featured,
                                    }),
                                ],
                            ].map(([key, section, workspace, status], index) => (
                                <div
                                    key={key}
                                    className="grid gap-3 py-5 sm:grid-cols-[32px_minmax(0,1fr)_auto] sm:items-center"
                                >
                                    <span className={mutedTextClass}>{index + 1}</span>
                                    <div>
                                        <h3 className={`font-semibold ${headingTextClass}`}>
                                            {t(`admin.hackathon_manager.flow.${key}`)}
                                        </h3>
                                        <p className={`mt-1 text-sm ${mutedTextClass}`}>{status}</p>
                                        <p className={`mt-1 text-sm ${mutedTextClass}`}>
                                            {t(`admin.hackathon_manager.flow.${key}Hint`)}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {section && (
                                            <AdminButton
                                                tone="subtle"
                                                onClick={() => configure(section)}
                                            >
                                                {t("admin.hackathon_manager.flow.configure")}
                                            </AdminButton>
                                        )}
                                        {workspace && (
                                            <AdminButton
                                                onClick={() => setActiveWorkspace(workspace)}
                                            >
                                                {t("admin.hackathon_manager.flow.manage")}
                                            </AdminButton>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </AdminPanel>
                )}
                {activeWorkspace !== "registrations" && (
                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                        <AdminMetricCard
                            label="总报名"
                            value={formatNumber(registrationTotal)}
                            icon={Users}
                        />
                        <AdminMetricCard
                            label="比赛日程"
                            value={formatNumber(scheduleConfig?.events?.length)}
                            icon={Filter}
                            tone="emerald"
                        />
                        <AdminMetricCard
                            label="作品总数"
                            value={formatNumber(workStats.total)}
                            icon={Award}
                            tone="indigo"
                        />
                        <AdminMetricCard
                            label="待审作品"
                            value={formatNumber(workStats.pending)}
                            icon={RefreshCw}
                            tone="amber"
                        />
                    </div>
                )}

                {activeWorkspace === "template" ? (
                    <HackathonTemplateEditor
                        initialEventKey={selectedEventKey}
                        focusSection={templateSection}
                        onTemplateChange={handleTemplateChange}
                    />
                ) : null}

                {activeWorkspace === "submissions" && selectedEventKey === AIX_EVENT_KEY ? (
                    <HackathonSubmissionManager
                        key={selectedEventKey}
                        eventKey={selectedEventKey}
                    />
                ) : null}

                {activeWorkspace === "registrations" ? (
                    <HackathonRegistrationWorkspace
                        key={selectedEventKey}
                        registrations={registrationsWithSubmissions}
                        events={scheduleConfig?.events || []}
                        eventKey={selectedEventKey}
                        onDelete={(id) => setConfirmState({ id })}
                    />
                ) : null}

                {activeWorkspace === "works" ? (
                    <AdminPanel
                        title={`作品与经验审核 (${formatNumber(filteredWorks.length)})`}
                        description={t("admin.hackathon_manager.selection.description", {
                            approved: workStats.approved,
                            featured: workStats.featured,
                        })}
                    >
                        <AdminToolbar>
                            <ToolbarGroup className="w-full flex-1">
                                <div className="relative w-full min-w-0 flex-1 md:max-w-lg">
                                    <Search
                                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                                        size={16}
                                    />
                                    <input
                                        type="text"
                                        placeholder="搜索比赛、作品、作者、荣誉、经验"
                                        value={workSearchTerm}
                                        onChange={(event) => setWorkSearchTerm(event.target.value)}
                                        className="theme-admin-input w-full rounded-xl py-2.5 pl-10 pr-4 text-sm"
                                    />
                                </div>
                            </ToolbarGroup>
                            <ToolbarGroup>
                                <select
                                    value={featuredFilter}
                                    onChange={(event) => setFeaturedFilter(event.target.value)}
                                    className="theme-admin-input min-h-11 rounded-xl px-3 py-2 text-sm"
                                    aria-label={t("admin.hackathon_manager.selection.filter")}
                                >
                                    {["all", "featured", "hidden"].map((key) => (
                                        <option key={key} value={key}>
                                            {t(`admin.hackathon_manager.selection.${key}`)}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    value={workStatusFilter}
                                    onChange={(event) => setWorkStatusFilter(event.target.value)}
                                    className="theme-admin-input min-h-[40px] rounded-xl px-3 py-2 text-sm"
                                    aria-label="按作品审核状态筛选"
                                >
                                    {Object.entries(workStatusLabels).map(([value, label]) => (
                                        <option key={value} value={value}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </ToolbarGroup>
                        </AdminToolbar>

                        {filteredWorks.length === 0 ? (
                            <AdminEmptyState
                                icon={Award}
                                title="暂无匹配的作品/经验"
                                description="外部提交作品后会进入这里；也可以在审核中心批量处理。"
                            />
                        ) : (
                            renderWorkCards()
                        )}
                    </AdminPanel>
                ) : null}

                {activeWorkspace === "media" ? (
                    <AdminPanel
                        title={t("admin.hackathon_manager.media.title", {
                            count: formatNumber(filteredMediaLinks.length),
                        })}
                        description={t("admin.hackathon_manager.media.description")}
                    >
                        {filteredMediaLinks.length === 0 ? (
                            <AdminEmptyState
                                icon={Sparkles}
                                title={t("admin.hackathon_manager.media.empty_title")}
                                description={t("admin.hackathon_manager.media.empty_description")}
                            />
                        ) : (
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                {filteredMediaLinks.map((media) => (
                                    <article
                                        key={media.id}
                                        className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
                                    >
                                        <img
                                            src={media.cover_url || media.url}
                                            alt={media.title}
                                            className="aspect-[4/3] w-full object-cover"
                                        />
                                        <div className="grid gap-2 p-3">
                                            <span
                                                className={`text-[11px] font-bold ${mutedTextClass}`}
                                            >
                                                {media.competition_title}
                                            </span>
                                            <strong
                                                className={`line-clamp-1 text-sm ${headingTextClass}`}
                                            >
                                                {media.title ||
                                                    t("admin.hackathon_manager.media.untitled")}
                                            </strong>
                                            <StatusBadge
                                                status={media.status}
                                                label={
                                                    workStatusLabels[media.status] || media.status
                                                }
                                            />
                                            <div className="flex flex-wrap gap-2">
                                                <AdminButton
                                                    disabled={saving || media.status === "approved"}
                                                    onClick={() => reviewMedia(media, "approved")}
                                                >
                                                    {t("admin.hackathon_manager.media.approve")}
                                                </AdminButton>
                                                <AdminButton
                                                    tone="danger"
                                                    disabled={saving || media.status === "rejected"}
                                                    onClick={() => reviewMedia(media, "rejected")}
                                                >
                                                    {t("admin.hackathon_manager.media.reject")}
                                                </AdminButton>
                                            </div>
                                            {media.resource_type === "video" ? (
                                                <select
                                                    className="theme-admin-input min-h-11 w-full rounded-lg px-2 text-sm"
                                                    value={media.role}
                                                    disabled={saving || media.status !== "approved"}
                                                    aria-label={t(
                                                        "admin.hackathon_manager.media.video_role"
                                                    )}
                                                    onChange={(event) =>
                                                        toggleMediaHighlight(
                                                            media,
                                                            event.target.value
                                                        )
                                                    }
                                                >
                                                    {["archive", "highlight", "official_film"].map(
                                                        (role) => (
                                                            <option key={role} value={role}>
                                                                {t(
                                                                    `admin.hackathon_manager.media.${role}`
                                                                )}
                                                            </option>
                                                        )
                                                    )}
                                                </select>
                                            ) : (
                                                <AdminButton
                                                    tone={
                                                        media.role === "highlight"
                                                            ? "subtle"
                                                            : "primary"
                                                    }
                                                    disabled={saving || media.status !== "approved"}
                                                    onClick={() => toggleMediaHighlight(media)}
                                                >
                                                    <Sparkles size={14} />
                                                    {media.role === "highlight"
                                                        ? t(
                                                              "admin.hackathon_manager.media.remove_action"
                                                          )
                                                        : t(
                                                              "admin.hackathon_manager.media.feature_action"
                                                          )}
                                                </AdminButton>
                                            )}
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </AdminPanel>
                ) : null}
            </AdminPageShell>

            <ConfirmDialog
                open={Boolean(confirmState)}
                title="确认删除报名记录"
                description="删除后该报名记录不会再显示在后台列表中。"
                confirmText="确认删除"
                tone="danger"
                pending={saving}
                onConfirm={deleteConfirmed}
                onCancel={() => setConfirmState(null)}
            />
        </>
    );
};

export default HackathonManager;
