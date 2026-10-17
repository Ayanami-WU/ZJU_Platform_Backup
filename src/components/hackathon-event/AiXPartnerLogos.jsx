import { useTranslation } from "react-i18next";
import "./AiXPartnerLogos.css";

const assetRoot = "/images/hackathon/ai-x/partners/";
const brands = [
    {
        id: "getui",
        name: "每日互动",
        light: "/images/partner-logos/getui.svg",
        dark: "/images/partner-logos/getui-dark.svg",
    },
    { id: "huadan", name: "华旦天使", source: `${assetRoot}huadan.jpg` },
    { id: "manhattan", name: "曼哈顿资本", source: `${assetRoot}manhattan.jpg` },
    { id: "puhua", name: "普华资本", source: `${assetRoot}puhua.png` },
    { id: "oufang", name: "藕舫天使", source: `${assetRoot}oufang.jpg` },
    { id: "delta-x", name: "迭代未来 Delta X", source: `${assetRoot}delta-x.webp` },
    {
        id: "zhipu",
        name: "智谱 Zhipu",
        // Official brand assets: https://www.zhipuai.cn/zh
        light: `${assetRoot}zhipu.svg`,
        dark: `${assetRoot}zhipu-white.svg`,
    },
    ...[
        ["entrepreneurship-alliance", "浙江大学创业联盟", "alliances"],
        ["investment", "投资协会", "investment"],
        ["lianhua", "联华利合协会", "lianhua"],
        ["zjuai", "浙江大学学生人工智能协会", "zjuai"],
        ["aira", "AI创研会", "aira"],
        ["cross-innovation", "跨界创新俱乐部", "cross-innovation"],
        ["guancha", "观猹 Insights", "guancha"],
        ["deepseekclub", "深求社区 DeepSeek Club", "deepseekclub"],
        ["huawei", "华为 Huawei", "huawei"],
    ].map(([id, name, file]) => ({
        id,
        name,
        light: `${assetRoot}${file}-light.png`,
        dark: `${assetRoot}${file}-dark.png`,
    })),
    ...[
        ["magic", "D调魔法学园"],
        ["unionlink", "友念智能 UnionLink-Intell"],
        ["yuandian", "元典 Legal Intelligence"],
        ["thunisoft", "华宇 THUNISOFT"],
        ["kab", "KAB创业俱乐部"],
        ["novax", "NovaX"],
        ["tianmao", "天猫校园"],
        ["ztvp", "浙江大学管理学院科技创业中心 ZTVP"],
    ].map(([id, name]) => ({ id, name, source: `${assetRoot}${id}.png` })),
    {
        id: "bonjour",
        name: "Bonjour!",
        light: "/images/partner-logos/company-3.png",
        dark: "/images/partner-logos/company-3-dark.png",
    },
    { id: "tuozhe", name: "拓浙 AI 生态", source: "/images/brand/logo-mark-transparent.png" },
    {
        id: "eagle",
        name: "时代强鹰 Elite Eagle",
        source: "/images/partner-logos/organizations/official/elite-eagle.png",
    },
    {
        id: "innovation",
        name: "浙江大学校徽",
        source: "/images/partner-logos/organizations/official/zhejiang-university.png",
    },
    {
        id: "aliyun",
        name: "阿里云 Alibaba Cloud",
        light: "/images/partner-logos/aliyun-cn.svg",
        dark: "/images/partner-logos/aliyun-cn-white.svg",
    },
    {
        id: "qoder",
        name: "Qoder",
        light: "/images/partner-logos/qoder.svg",
        dark: "/images/partner-logos/qoder-dark.svg",
    },
    {
        id: "modelscope",
        name: "魔搭社区 ModelScope",
        light: "/images/partner-logos/modelscope.png",
        dark: "/images/partner-logos/modelscope-dark.png",
    },
];
export function AiXBrand({ id, name }) {
    const brand = brands.find((item) => item.id === id);
    if (!brand) return <span className="aix-partner-name">{name}</span>;
    return (
        <span
            className={`aix-brand-logo aix-brand-${id}`}
            role="img"
            aria-label={name || brand.name}
        >
            <img
                className="aix-logo-light"
                src={brand.source || brand.light}
                alt=""
                loading="lazy"
            />
            <img className="aix-logo-dark" src={brand.source || brand.dark} alt="" loading="lazy" />
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
                                    <li key={member.id} data-partner={member.id}>
                                        <AiXBrand id={member.id} name={member.name} />
                                        {member.id === "tianmao" && (
                                            <span
                                                className="aix-partner-wordmark"
                                                aria-hidden="true"
                                            >
                                                {member.name}
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </dd>
                    </div>
                ))}
        </dl>
    );
}
