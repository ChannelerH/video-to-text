"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefreshCw, AlertCircle, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ReactNode } from "react";

export interface ErrorDialogProps {
  isOpen: boolean;
  error: {
    type: 'api_error' | 'timeout' | 'network' | 'server' | null;
    message: ReactNode;
    canRetry: boolean;
    retryAction?: () => void;
  } | null;
  onClose: () => void;
  onRetry?: () => void;
}

export function ErrorDialog({ isOpen, error, onClose, onRetry }: ErrorDialogProps) {
  const t = useTranslations("error_dialog");

  if (!error) return null;

  const handleRetry = () => {
    if (error.retryAction) {
      error.retryAction();
    } else if (onRetry) {
      onRetry();
    }
    onClose();
  };

  const getTitle = () => {
    switch (error.type) {
      case 'timeout':
        return t("timeout_title") || "Operation Timeout";
      case 'server':
        return t("server_error_title") || "Server Error";
      case 'network':
        return t("network_error_title") || "Network Error";
      default:
        return t("error_title") || "Error Occurred";
    }
  };

  const getDescription = (): ReactNode => {
    switch (error.type) {
      case 'timeout':
        return t("timeout_description") || "The operation is taking longer than expected. This might be due to server load or file size.";
      case 'server':
        return t("server_error_description") || "The server encountered an error. Please try again in a moment.";
      case 'network':
        return t("network_error_description") || "Unable to connect to the server. Please check your internet connection.";
      default:
        if (typeof error.message === 'string') {
          const upgradeMatch = error.message.match(/^(.*?)(?:\s*[—-]\s*)?Upgrade at \/pricing\.?$/i);
          if (upgradeMatch) {
            const prefix = upgradeMatch[1]?.trim();
            return (
              <span>
                {prefix ? `${prefix} ` : ''}
                <Link href="/pricing" className="text-cyan-300 hover:text-cyan-200 underline">
                  Upgrade
                </Link>
              </span>
            );
          }
        }
        return error.message;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-gray-950 border-gray-800 text-gray-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <AlertCircle className="h-5 w-5 text-red-400" />
            {getTitle()}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <DialogDescription className="text-sm text-gray-300">
            {getDescription()}
          </DialogDescription>

          {error.type === 'timeout' && (
            <Alert className="bg-amber-500/10 border border-amber-500/30">
              <AlertDescription className="text-sm text-amber-200">
                {t("timeout_suggestion") || "You can retry the operation or try again later with a smaller file."}
              </AlertDescription>
            </Alert>
          )}

          {error.type === 'server' && (
            <Alert className="bg-red-500/10 border border-red-500/30">
              <AlertDescription className="text-sm text-red-200">
                {t("server_error_suggestion") || "If the problem persists, please contact support."}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-0">
          {error.canRetry && (
            <Button 
              onClick={handleRetry} 
              className="flex-1 sm:flex-none"
              variant="default"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {t("retry") || "Retry"}
            </Button>
          )}
          <Button 
            variant="outline" 
            onClick={onClose} 
            className="flex-1 sm:flex-none border-gray-700 text-gray-300 hover:bg-gray-800"
          >
            {error.canRetry ? (t("cancel") || "Cancel") : (t("close") || "Close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
