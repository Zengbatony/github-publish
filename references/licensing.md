# 版权与许可规范（通用基线）

> 本文档是所有 Skill / 工具仓库发布前的许可要求基线。
> 适用于自研项目、衍生项目（MIT / Apache / GPL）以及无许可仓库的处理。
> 一句话原则：**上游的版权声明一个字都不能删，自己的修改要明确标注。**

---

## 一、MIT 到底要求什么

以 [`voltwake/xianyu-monitor`](https://github.com/voltwake/xianyu-monitor)（MIT）作为实例说明。
MIT 全文只有 **两条强制义务**，全部集中在下面这一段：

> The above copyright notice and this permission notice shall be included in
> all copies or substantial portions of the Software.

翻成可执行的两件事：

| # | 义务 | 具体做法 |
|---|---|---|
| 1 | **保留版权声明** | 任何副本、任何分发形式（源码、二进制、打包、镜像）都必须带上原作者的 `Copyright (c) <年份> <作者>` |
| 2 | **保留许可声明** | MIT 正文（含全部免责声明 `THE SOFTWARE IS PROVIDED "AS IS"`）必须原样保留，不能删、不能改写、不能只留标题 |

**"substantial portions"（实质部分）是关键**：哪怕你只搬了 30 行核心逻辑到一个新项目里，那段代码所在的项目也必须带声明。

### MIT 不管的事（常见误解）

| 误解 | 事实 |
|---|---|
| "用了 MIT 代码就必须开源我的项目" | ❌ 不必。MIT 不是 copyleft，可以闭源、可以商用、可以卖钱 |
| "衍生品必须也用 MIT" | ❌ 法律上不必。但**实务上强烈建议**，因为你要保留 MIT 声明，混用其他协议会产生条款冲突 |
| "必须通知原作者" | ❌ 不需要 |
| "必须在 README 里点名致谢" | ❌ 法律不要求。但**我们的标准要求这么做**，见第四节 |
| "不能限制别人再分发" | ✅ 正确，MIT 不允许附加限制 |

### MIT 里没有"禁止背书"条款

容易和 BSD-3-Clause 混淆：

- **BSD-3-Clause** 有第三条：不得用原作者名义为衍生品背书
- **MIT** 没有这条，但也没有授权你用原作者名义

**实务要求：不要在营销文案里写"由 XXX 官方支持/推荐"，除非真的拿到授权。**

---

## 二、上游 LICENSE 的一个坑（2026-11-08 实际遇到）

上游 `voltwake/xianyu-monitor` 的 LICENSE 原文是：

```
MIT License

Copyright (c) 2026
```

**"Copyright (c) 2026" 后面没有著作权人姓名。** 这是 MIT 模板的不严谨用法——法律上著作权人是缺失的，声明不完整。

处理方式（推荐沿用）：

1. 按仓库所有者推断署名人为 `voltwake`；
2. 在 LICENSE 里显式写明上游仓库 URL，使来源可追溯；
3. 在本文档里记录这一判断，避免日后争议。

```licence
Copyright (c) 2026 voltwake
  upstream: https://github.com/voltwake/xianyu-monitor
```

**遇到同类情况时不要沉默处理**——要么补全并注明推断依据，要么联系原作者确认，绝不能把不完整的声明当成完整声明用。

---

## 三、四种情形的标准做法

### A. 完全自研

```licence
MIT License

Copyright (c) 2026 Zengbatony
```

配 `package.json` 的 `"license": "MIT"`，README 徽章指向 `LICENSE`。

### B. 衍生自 MIT 上游

**双署名，上游在前**：

```licence
MIT License

Copyright (c) 2026 <上游作者>
  upstream: https://github.com/<上游作者>/<上游仓库>

Copyright (c) <年份> Zengbatony
  modifications: https://github.com/Zengbatony/<本仓库>
```

再加 **README 的 Credits 段落**，写明具体改了什么（见第四节）。

### C. 衍生自 Apache-2.0 上游

比 MIT 多三个动作，**很容易漏**：

1. 保留上游 `LICENSE` 全文（不是摘要）
2. 若上游有 `NOTICE` 文件，**必须一并保留**，可在末尾追加自己的声明
3. 每个被修改的文件要**标注修改**（通常在文件头加一行 `Modified by ... on YYYY-MM-DD`）

Apache-2.0 还含专利授权条款，衍生品继续用 Apache-2.0 最省事。

### D. 衍生自 GPL / AGPL 上游

**有传染性**：衍生品必须以同一协议开源，且分发时必须提供完整源码。
闭源商用**不行**。若业务上需要闭源，唯一合法路径是找原作者谈商业授权。

---

## 四、我们的额外要求（比法律底线更严）

法律只要求保留声明，但作为公开 Skill 发布时，额外要求：

| 要求 | 位置 | 说明 |
|---|---|---|
| 上游来源可点击 | `LICENSE` + `README.md` | 写全 URL，不写"某位作者" |
| 修改内容清单 | `README.md` 的「与上游的差异」 | 逐条列出新增/重写了什么，便于上游回看 |
| 不冒充原创 | `README.md` 开头 | 若核心逻辑来自上游，第一段就要说明 |
| 不虚假背书 | 全文 | 不写"官方版""作者推荐"等表述 |
| 许可证一致 | `package.json` / `SKILL.md` | `license` 字段必须与 `LICENSE` 文件一致 |

---

## 五、发布前检查清单

推送到公开仓库前，逐项过一遍：

- [ ] 根目录有 `LICENSE` 文件，且是**全文**不是摘要
- [ ] 衍生项目：上游 `Copyright` 行完整保留，且在自己的 `Copyright` 行**之前**
- [ ] 衍生项目：`LICENSE` 里有上游仓库 URL
- [ ] `package.json` 的 `license` 字段与 `LICENSE` 一致
- [ ] `README.md` 有 Credits / 与上游的差异 段落
- [ ] Apache-2.0 上游：`NOTICE` 文件已保留
- [ ] GPL 上游：已确认可以开源，不是闭源商用
- [ ] 代码里没有从**无许可证**项目抄来的片段（无许可证 = 保留所有权利，不能抄）
- [ ] 没有把别人的 API Key、内网地址、个人隐私提交上去

自动化检查：

```bash
node scripts/check-license.js          # 检查本仓库
node scripts/check-license.js --json   # 机器可读
```

CI 已接入，不通过会直接 fail。

---

## 六、如果上游是"无许可证"

GitHub 上很多仓库没写 LICENSE。**没写 = 保留所有权利（All Rights Reserved）**，法律上你不能复制、修改、分发任何部分，哪怕只是参考。

合规做法按优先级：

1. 找作者开 issue 请求授权（最快最正规）
2. 找同类项目的 MIT/Apache 替代品
3. 只看思路不看代码，用自己的实现重写（**思路不受版权保护，表达受保护**）

第 3 条在实践中很常用，但要注意：**重写要真的重写**，不能把函数名改一改、变量换一换就当自己写的。结构、注释、命名习惯的雷同都可能被认定为复制。

---

## 七、一句话总结

> MIT 给你的是"随便用"的自由，代价只有一句：**别把别人的名字抹掉。**
