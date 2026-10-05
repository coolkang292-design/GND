// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ExerciseThumbTile } from "./exercise-thumb";
import { localTrialImage } from "@/lib/domain/exercise-image-local-trial";
vi.mock("next/image", () => ({
  // Native img is deliberate here so the test can dispatch the load-error event.
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt ?? ""} />,
}));
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

it("never enables trial image paths in production, even with the flag", () => {
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("NEXT_PUBLIC_EXERCISE_IMAGE_LOCAL_QA", "1");
  expect(localTrialImage("사이클")).toBeUndefined();
});
it("requires explicit opt-in in development", () => {
  vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("NEXT_PUBLIC_EXERCISE_IMAGE_LOCAL_QA", "");
  expect(localTrialImage("사이클")).toBeUndefined();
});
it("keeps the exercise row and switches to a body-part image after load error", () => {
  vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("NEXT_PUBLIC_EXERCISE_IMAGE_LOCAL_QA", "1");
  const {container, rerender} = render(<ExerciseThumbTile name="체스트프레스 머신" bodyPart="가슴" />);
  fireEvent.error(container.querySelector("img")!);
  expect(container.querySelector("img")!.getAttribute("src")).toBe("/ui-icons/part-chest.webp");
  expect(container.querySelector("img")!.parentElement!.className).toContain("h-12 w-12");
  rerender(<ExerciseThumbTile name="사이클" bodyPart="유산소" />);
  expect(container.querySelector("img")!.getAttribute("src")).toContain("84acc89a");
});
