"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Gem } from "@/components/healthmith/gem";
import { ActionBar, ActionLink, ChoiceButton, Notice, PageIntro } from "@/components/healthmith/ui";
import { gemStates } from "@/lib/healthmith/preview-data";

const gemGroups: ("progress" | "condition")[] = ["progress", "condition"];

export default function GemsPage() {
  const [selected, setSelected] = useState(gemStates[5]);
  const [filter, setFilter] = useState<"all" | "progress" | "condition">("all");

  return <>
    <PageIntro eyebrow="THE GEMSMITH’S CABINET" title="보석의 열두 가지 표정" description="작은 원석이 나만의 빛을 가지기까지." />
    <div className="hm-selected-gem"><Gem state={selected.state} label={selected.name} /><h2>{selected.name}</h2><p>{selected.description}</p></div>
    <div className="hm-choice-grid is-three hm-gem-filters" role="group" aria-label="보석 시안 분류"><ChoiceButton selected={filter === "all"} onClick={() => setFilter("all")}>전체 12종</ChoiceButton><ChoiceButton selected={filter === "progress"} onClick={() => setFilter("progress")}>진행 단계</ChoiceButton><ChoiceButton selected={filter === "condition"} onClick={() => setFilter("condition")}>보석 상태</ChoiceButton></div>
    {gemGroups.filter((group) => filter === "all" || filter === group).map((group) => <section key={group} className="hm-gallery-section"><h2>{group === "progress" ? "Ⅰ. 광석에서 보석까지" : "Ⅱ. 완성도에 따른 상태"}</h2><div className="hm-gem-grid">{gemStates.filter((gem) => gem.group === group).map((gem) => <Button key={gem.state} className={`hm-card hm-gem-card ${selected.state === gem.state ? "is-selected" : ""}`} aria-pressed={selected.state === gem.state} aria-label={gem.name} data-gem-state={gem.state} onClick={() => setSelected(gem)}><Gem state={gem.state} /><h3>{gem.name}</h3><p>{gem.description}</p></Button>)}</div></section>)}
    <div className="hm-survey-bottom"><Notice>결함 시안은 표현 비교용이에요.<br />이번 MVP의 실패·능력치 규칙과는 별도로 검토해요.</Notice></div>
    <ActionBar><ActionLink href="/preparation/body">나의 보석 만들러 가기</ActionLink></ActionBar>
  </>;
}
