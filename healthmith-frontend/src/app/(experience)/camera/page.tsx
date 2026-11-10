import PreviewCamera from "./preview-camera";
import { ConnectedCamera } from "./connected-camera";
export default async function CameraPage({ searchParams }: { searchParams: Promise<{ curriculumId?: string | string[] }> }) {
  const { curriculumId } = await searchParams;
  if (curriculumId !== undefined) return <ConnectedCamera curriculumId={typeof curriculumId === "string" ? curriculumId : "invalid"} />;
  return <PreviewCamera />;
}
