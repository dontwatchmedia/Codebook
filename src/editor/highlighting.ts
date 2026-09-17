import { common, createLowlight } from "lowlight";
import powershell from "highlight.js/lib/languages/powershell";
export const lowlight = createLowlight(common);
lowlight.register({ powershell });
