import { useTranslation } from "react-i18next";

const brands = [
    ...[
        { id: "entrepreneurship-alliance", name: "浙江大学创业联盟", viewBox: "550 1225 275 195" },
        { id: "investment", name: "投资协会", viewBox: "50 1615 255 185" },
        { id: "lianhua", name: "联华利合协会", viewBox: "360 1625 170 180" },
        { id: "magic", name: "D调魔法学园", viewBox: "590 1620 240 165" },
    ].map((brand) => ({
        ...brand,
        source: "/images/hackathon/ai-x/official/partner-lineup.png",
        imageWidth: 859,
        imageHeight: 1831,
    })),
    { id: "bonjour", name: "Bonjour!", light: "company-3.png", dark: "company-3-dark.png" },
    // Display approved marks directly from the supplied poster without redrawing them.
    ...[
        { id: "unionlink", name: "友念智能 UnionLink-Intell", viewBox: "734 714 304 114" },
        { id: "yuandian", name: "元典 Legal Intelligence", viewBox: "164 936 390 97" },
        { id: "thunisoft", name: "华宇 THUNISOFT", viewBox: "637 927 351 124" },
    ].map((brand) => ({
        ...brand,
        source: "/images/hackathon/ai-x/official/company-lineup-oct12.jpg",
    })),
    ...["kab", "zjuai", "aira", "cross-innovation"].map((id) => ({
        id,
        name: id,
        source: `/images/hackathon/ai-x/official/${id}.webp`,
        plate: true,
    })),
    {
        id: "novax",
        name: "NovaX",
        source: "/images/hackathon/ai-x/official/novax.jpg",
        plate: true,
    },
    {
        id: "tianmao",
        name: "天猫校园",
        source: "/images/hackathon/ai-x/official/tianmao.webp",
        plate: true,
    },
    {
        id: "guancha",
        name: "观猹",
        light: "organizations/official/guancha.svg",
        dark: "organizations/official/guancha.svg",
        plate: true,
    },
    {
        id: "deepseekclub",
        name: "深求社区",
        light: "organizations/official/deepseek-club.png",
        dark: "organizations/official/deepseek-club.png",
        plate: true,
    },
    {
        id: "innovation",
        name: "浙江大学校徽",
        light: "organizations/official/zhejiang-university.png",
        dark: "organizations/official/zhejiang-university.png",
        plate: true,
    },
    { id: "tuozhe", name: "拓浙 AI 生态", source: "/images/brand/logo-mark-transparent.png" },
    {
        id: "eagle",
        name: "时代强鹰 Elite Eagle",
        source: "/images/hackathon/ai-x/official/eagle.webp",
        light: "organizations/official/elite-eagle.png",
        dark: "organizations/official/elite-eagle.png",
        plate: true,
    },
    {
        id: "ztvp",
        name: "浙江大学管理学院科技创业中心 ZTVP",
        source: "/images/hackathon/ai-x/official/ztvp.webp",
        light: "organizations/official/ztvp.png",
        dark: "organizations/official/ztvp.png",
        plate: true,
    },
    { id: "huawei", name: "华为 Huawei", light: "huawei.png", dark: "huawei.png", plate: true },
    {
        id: "aliyun",
        name: "阿里云 Alibaba Cloud",
        light: "aliyun-cn.svg",
        dark: "aliyun-cn-white.svg",
    },
    { id: "qoder", name: "Qoder", light: "qoder.svg", dark: "qoder-dark.svg" },
    {
        id: "modelscope",
        name: "魔搭社区 ModelScope",
        light: "modelscope.png",
        dark: "modelscope-dark.png",
    },
];
export function AiXBrand({ id }) {
    const brand = brands.find((item) => item.id === id);
    if (!brand) return null;
    if (brand.viewBox)
        return (
            <span className={`aix-brand-logo aix-brand-${id}`}>
                <svg viewBox={brand.viewBox} role="img" aria-label={brand.name}>
                    <image
                        href={brand.source}
                        width={brand.imageWidth || 1080}
                        height={brand.imageHeight || 1066}
                    />
                </svg>
            </span>
        );
    return (
        <span className={`aix-brand-logo aix-brand-${id} ${brand.plate ? "aix-brand-plate" : ""}`}>
            <img
                className="aix-logo-light"
                src={brand.source || `/images/partner-logos/${brand.light}`}
                alt={brand.name}
                loading="lazy"
            />
            <img
                className="aix-logo-dark"
                src={brand.source || `/images/partner-logos/${brand.dark}`}
                alt={brand.name}
                loading="lazy"
            />
        </span>
    );
}
export default function AiXPartnerLogos() {
    const { t } = useTranslation();
    return (
        <dl className="aix-partner-panels">
            {t("aix.pages.partnerGroups", { returnObjects: true })
                .filter((group) => group.published)
                .map((group) => (
                    <div key={group.id} data-partner-group={group.id}>
                        <dt>{group.label}</dt>
                        <dd>
                            <ul className="aix-partner-members">
                                {group.members.map((member) => (
                                    <li key={member.id}>
                                        <AiXBrand id={member.id} />
                                        <span className="aix-partner-name">{member.name}</span>
                                    </li>
                                ))}
                            </ul>
                        </dd>
                    </div>
                ))}
        </dl>
    );
}
