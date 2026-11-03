import Image from "next/image";
import type { GemState } from "@/lib/healthmith/preview-data";
import ore from "./assets/gem-ore.svg";
import mined from "./assets/gem-mined.svg";
import split from "./assets/gem-split.svg";
import washed from "./assets/gem-washed.svg";
import cut from "./assets/gem-cut.svg";
import polished from "./assets/gem-polished.svg";
import pristine from "./assets/gem-pristine.svg";
import cracked from "./assets/gem-cracked.svg";
import fragments from "./assets/gem-fragments.svg";
import stained from "./assets/gem-stained.svg";
import deformed from "./assets/gem-deformed.svg";
import matte from "./assets/gem-matte.svg";

const gemAssets = { ore, mined, split, washed, cut, polished, pristine, cracked, fragments, stained, deformed, matte };

export function Gem({ state = "polished", label, className = "" }: { state?: GemState; label?: string; className?: string }) {
  return <Image className={`hm-gem ${className}`} src={gemAssets[state]} width={240} height={240} alt={label ?? ""} unoptimized />;
}
