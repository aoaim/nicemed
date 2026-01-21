# NiceMed

NiceMed 是一个 Firefox 浏览器插件，在访问 PubMed 时自动显示期刊的分区和影响因子，在 Google Scholar 提供相对便捷的 PubMed 跳转。

> [!NOTE]
> **声明**: 此插件完全由 **Gemini 3.0 Pro** 和 **Claude Opus 4.5** 编写，无任何人工手搓代码成分，放心食用。

## 功能特性

### PubMed 页面
在搜索结果和文章页面显示以下徽章：
- **期刊名** - 格式化显示
- **JCR 分区** (Q1-Q4) - 彩色标签
- **中科院分区** (1-4区) - 含大类及排名
- **IF 影响因子** - 2024 JCR 数据
- **🏆 TOP** - Top 期刊标识
- **⚠️ WARN** - 2025年国际期刊预警名单
- **🌊 MEGA** - Mega-Journal 标识
- **🇨🇳 CN** - 中国 SCI 期刊支持计划

### Google Scholar 页面
- **Search in PubMed** 按钮 - 在每个搜索结果旁添加浅红色边框按钮，点击可直接跳转到 PubMed 搜索该文章

## 安装步骤

1. 打开 Firefox，输入 `about:debugging#/runtime/this-firefox`
2. 点击 **"Load Temporary Add-on..."**
3. 选择 `extension/manifest.json` 文件
4. 访问 PubMed 或 Google Scholar 进行测试

## 数据维护与更新指南

本插件的数据源 (`journals.json`) 是通过 Node.js 脚本从 CSV 文件生成的。

### 1. 准备环境
确保已安装 [Node.js](https://nodejs.org/)。

### 2. 准备数据文件
将 CSV 数据文件放入 `csv/` 目录：
- **中科院分区数据**: `csv/FQBJCR2025-UTF8.csv`
- **JCR 数据**: `csv/JCR2024-UTF8.csv`

> [!IMPORTANT]
> 确保 CSV 文件为 **UTF-8 编码**，否则可能出现乱码。

### 3. 运行转换脚本
```bash
node scripts/convert-csv.js
```
脚本会自动：
- 过滤非医学/生命科学类期刊
- 合并 JCR 和中科院分区数据
- 生成 `extension/data/journals.json`

### 4. 重新加载插件
回到 `about:debugging` 页面，点击 NiceMed 旁的 **Reload** 按钮。

## 项目结构

```
nicemed/
├── csv/
│   ├── FQBJCR2025-UTF8.csv   # 中科院分区数据
│   └── JCR2024-UTF8.csv      # JCR 数据
├── extension/
│   ├── manifest.json         # 扩展配置
│   ├── background.js         # 后台数据服务和匹配算法
│   ├── content/
│   │   ├── constants.js      # 全局常量
│   │   ├── common.js         # NiceMed 核心工具类
│   │   ├── pubmed.js         # PubMed 内容脚本
│   │   └── scholar.js        # Google Scholar 内容脚本
│   ├── styles/
│   │   └── badge.css         # 徽章样式
│   └── data/
│       └── journals.json     # 期刊数据库
└── scripts/
    └── convert-csv.js        # CSV 转换脚本
```

## 技术细节

### 期刊匹配算法
1. **ISSN 精准匹配** - 优先使用 `<meta name="citation_issn">` 标签
2. **名称归一化匹配** - 去除标点、转大写后完全匹配
3. **模糊匹配** - 前缀匹配 + 长度惩罚，防止误匹配
4. **截断检测** - 对以 "of"、"and" 等结尾的名称不进行模糊匹配

### 特殊处理
- **PNAS** 等缩写保持全大写
- **eBiomedicine**、**iScience** 等保持特殊大小写
- 过滤 `[HTML]`、`[PDF]` 等 Google Scholar 标记

## 致谢

感谢 [ShowJCR](https://github.com/hitfyd/ShowJCR) 项目提供的分区数据表。