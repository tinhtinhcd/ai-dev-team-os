"use server";

import { readBrainFile, writeBrainFile, type BrainFile } from "@/lib/brain";

export async function loadBrainFile(filename: BrainFile): Promise<string> {
  return readBrainFile(filename);
}

export async function saveBrainFile(
  filename: BrainFile,
  content: string
): Promise<{ success: boolean; error?: string }> {
  try {
    writeBrainFile(filename, content);
    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { success: false, error: message };
  }
}
