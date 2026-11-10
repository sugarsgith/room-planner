import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

export function useUpdatePrompt() {
  const [simulated, setSimulated] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        registration.update().catch(() => undefined);
      };
      const onVisibility = () => {
        if (document.visibilityState === "visible") check();
      };
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("focus", check);
    },
  });

  useEffect(() => {
    const show = () => setSimulated(true);
    window.addEventListener("room-planner-update-available", show);
    return () => window.removeEventListener("room-planner-update-available", show);
  }, []);

  async function applyUpdate() {
    const preview = simulated;
    try {
      await updateServiceWorker(true);
    } finally {
      if (preview) window.location.reload();
    }
  }

  return { visible: needRefresh || simulated, applyUpdate };
}
