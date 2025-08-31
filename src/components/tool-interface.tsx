"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, Download, Clock, Shield, Zap } from "lucide-react";

interface ToolInterfaceProps {
  mode?: "video" | "audio";
}

export default function ToolInterface({ 
  mode = "video"
}: ToolInterfaceProps) {
  const [inputMethod, setInputMethod] = useState<"link" | "upload">("link");
  const [url, setUrl] = useState("");
  const [selectedFormats, setSelectedFormats] = useState(["txt", "srt"]);
  const [file, setFile] = useState<File | null>(null);

  const handleMethodChange = (method: "link" | "upload") => {
    setInputMethod(method);
    setUrl("");
    setFile(null);
  };

  const handleFormatToggle = (format: string) => {
    setSelectedFormats(prev => 
      prev.includes(format) 
        ? prev.filter(f => f !== format)
        : [...prev, format]
    );
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setUrl("");
    }
  };

  const getAcceptTypes = () => {
    return mode === "video" 
      ? ".mp4,.mov,.webm,.avi" 
      : ".mp3,.m4a,.wav,.ogg,.flac";
  };

  const getPlaceholder = () => {
    return mode === "video" 
      ? "Paste a YouTube or MP4 link..." 
      : "Paste an MP3/M4A/WAV link...";
  };

  const formats = [
    { id: "txt", label: "TXT", icon: FileText },
    { id: "srt", label: "SRT", icon: Download },
    { id: "vtt", label: "VTT", icon: Download },
    { id: "docx", label: "DOCX", icon: FileText },
    { id: "md", label: "Markdown", icon: FileText },
    { id: "json", label: "JSON", icon: FileText }
  ];

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Input Method Switch */}
      <div className="flex justify-center mb-6">
        <Tabs value={inputMethod} onValueChange={(value) => handleMethodChange(value as "link" | "upload")}>
          <TabsList className="grid w-full grid-cols-2 max-w-sm">
          <TabsTrigger value="upload">Upload File</TabsTrigger>
          <TabsTrigger value="link">Paste Link</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Main Tool Interface */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-6 shadow-lg">
        {/* Input Content */}
        <div className="space-y-4">
          {inputMethod === "link" ? (
            <div>
              <Input
                placeholder={getPlaceholder()}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="h-12"
              />
            </div>
          ) : (
            <div className="relative">
              <input
                type="file"
                accept={getAcceptTypes()}
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Button
                variant="outline"
                className="w-full h-12"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload {mode === "video" ? "Video" : "Audio"} File
              </Button>
            </div>
          )}

          {/* File Display */}
          {file && (
            <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium">{file.name}</span>
                <Badge variant="secondary" className="text-xs">
                  {(file.size / (1024 * 1024)).toFixed(1)} MB
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFile(null)}
                className="text-red-600 hover:text-red-700"
              >
                Remove
              </Button>
            </div>
          )}

          {/* Export Format Selection */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Export Formats</h3>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {formats.map((format) => (
                <label
                  key={format.id}
                  className="flex items-center space-x-2 p-2 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <Checkbox
                    checked={selectedFormats.includes(format.id)}
                    onCheckedChange={() => handleFormatToggle(format.id)}
                  />
                  <format.icon className="w-4 h-4" />
                  <span className="text-sm">{format.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Action Button */}
          <Button 
            className="w-full h-12 text-lg font-semibold"
            size="lg"
            disabled={!url && !file}
          >
            <Clock className="w-5 h-5 mr-2" />
            Start Preview (90 seconds)
          </Button>

          {/* Trust Indicators */}
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-gray-600 dark:text-gray-400 pt-2">
            <div className="flex items-center gap-1">
              <Zap className="w-4 h-4 text-green-600" />
              <span>{mode === "video" ? "Fetch YouTube captions first" : "Auto language detection"}</span>
            </div>
            <div className="flex items-center gap-1">
              <Shield className="w-4 h-4 text-blue-600" />
              <span>24h auto-delete source files</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4 text-purple-600" />
              <span>Free 90s preview</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}