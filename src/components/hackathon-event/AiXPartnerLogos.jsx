import { useTranslation } from "react-i18next";

const brands = [
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
        <dl className="aix-partner-groups aix-partners-october12">
            {t("aix.october12.partnerGroups", { returnObjects: true })
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
