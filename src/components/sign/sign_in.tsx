"use client";

import { Button } from "@/components/ui/button";
import { useAppContext } from "@/contexts/app";
import { useTranslations } from "next-intl";
import { trackMixpanelEvent } from "@/lib/mixpanel-browser";

export default function SignIn() {
  const t = useTranslations();
  const { setShowSignModal } = useAppContext();

  return (
    <Button
      variant="default"
      onClick={() => {
        trackMixpanelEvent("auth.sign_modal_open", {
          source: "header",
        });
        setShowSignModal(true);
      }}
      className="cursor-pointer"
    >
      {t("user.sign_in")}
    </Button>
  );
}
