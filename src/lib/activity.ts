export type Activity = {
  id: string;
  time: string;
  type: "encrypt" | "decrypt" | "hash" | "keygen" | "password";
  algorithm?: string;
  detail: string;
};

const KEY = "securevault.activity";

export function getActivity(): Activity[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function logActivity(a: Omit<Activity, "id" | "time">) {
  if (typeof window === "undefined") return;
  const list = getActivity();
  list.unshift({ ...a, id: crypto.randomUUID(), time: new Date().toISOString() });
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 100)));
}

export function clearActivity() {
  localStorage.removeItem(KEY);
}