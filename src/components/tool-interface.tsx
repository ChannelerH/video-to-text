"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, Download, Shield, Zap, Copy, Check } from "lucide-react";

interface ToolInterfaceProps {
  mode?: "video" | "audio";
}

export default function ToolInterface({ 
  mode = "video"
}: ToolInterfaceProps) {
  const [inputMethod, setInputMethod] = useState<"link" | "upload">("upload");
  const [url, setUrl] = useState("");
  const [selectedFormats, setSelectedFormats] = useState(["txt", "srt"]);
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [result, setResult] = useState<any>(null);
  const [uploadedFileInfo, setUploadedFileInfo] = useState<any>(null);
  const [copiedText, setCopiedText] = useState<boolean>(false);

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

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setUrl("");
      
      // 立即上传文件到 R2
      setProgress("Uploading file to cloud storage...");
      try {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("mode", mode);

        const uploadResponse = await fetch("/api/upload", {
          method: "POST",
          body: formData
        });

        const uploadResult = await uploadResponse.json();
        if (uploadResult.success) {
          setUploadedFileInfo(uploadResult.data);
          setProgress("File uploaded successfully! Ready for transcription.");
        } else {
          setProgress(`Upload failed: ${uploadResult.error}`);
          setFile(null); // 清除文件选择
        }
      } catch (error) {
        console.error("Upload error:", error);
        setProgress("Upload failed. Please try again.");
        setFile(null); // 清除文件选择
      }
    }
  };

  const handleTranscribe = async () => {
    if (!url && !uploadedFileInfo) return;

    setIsProcessing(true);
    setProgress("Starting transcription...");
    setResult(null);

    try {
      let requestData;
      if (inputMethod === "link" && url) {
        setProgress("Processing video transcription...");
        requestData = {
          type: "youtube_url",
          content: url,
          action: "transcribe",
          options: { formats: selectedFormats }
        };
      } else if (inputMethod === "upload" && uploadedFileInfo) {
        setProgress("Processing file transcription...");
        requestData = {
          type: "file_upload",
          content: uploadedFileInfo.replicateUrl,
          action: "transcribe",
          options: { formats: selectedFormats }
        };
      } else {
        setProgress("Please wait for file upload to complete or enter a URL.");
        setIsProcessing(false);
        return;
      }

      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestData)
      });

      const result = await response.json();
      if (result.success) {
        setResult({ type: "full", data: result.data });
        setProgress("Transcription completed!");
      } else {
        console.error('Transcription API error:', result.error);
        const userFriendlyError = result.error.includes('null response') 
          ? 'The audio file appears to be invalid or corrupted. Please try uploading a valid audio/video file.'
          : result.error.includes('No transcription content')
          ? 'No speech was detected in the file. Please ensure your audio contains clear speech.'
          : `Transcription failed: ${result.error}`;
        setProgress(userFriendlyError);
      }
    } catch (error) {
      console.error("Transcription error:", error);
      setProgress("An error occurred. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };


  const downloadFormat = async (format: string) => {
    if (!result?.data) return;

    try {
      // 创建并下载文件
      const content = result.data.formats[format];
      const title = result.data.videoInfo?.title || 'transcription';
      const safeTitle = title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
      const fileName = `${safeTitle}.${format}`;

      const blob = new Blob([content], { type: getContentType(format) });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    } catch (error) {
      console.error('Failed to copy text:', error);
    }
  };

  const getContentType = (format: string): string => {
    const contentTypes: Record<string, string> = {
      txt: 'text/plain',
      srt: 'application/x-subrip',
      vtt: 'text/vtt',
      json: 'application/json',
      md: 'text/markdown'
    };
    return contentTypes[format] || 'text/plain';
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
        <Tabs value={inputMethod} onValueChange={(value) => handleMethodChange(value as  "upload" | "link" )}>
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
                onClick={() => {
                  setFile(null);
                  setUploadedFileInfo(null);
                  setProgress("");
                }}
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
            disabled={
              isProcessing || 
              (inputMethod === "link" && !url) || 
              (inputMethod === "upload" && !uploadedFileInfo)
            }
            onClick={handleTranscribe}
          >
            <FileText className="w-5 h-5 mr-2" />
            {isProcessing ? "Transcribing..." : "Transcribe"}
          </Button>

          {/* Progress Display */}
          {progress && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-blue-700 dark:text-blue-300">{progress}</p>
            </div>
          )}

          {/* Results Display */}
          {result && result.data && (
            <div className="mt-4 space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <h3 className="font-semibold text-green-800 dark:text-green-200 mb-4">
                  Transcription Complete
                </h3>
                
                <div className="space-y-4">
                  {/* Metadata */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Language:</span> {result.data.transcription.language}
                    </div>
                    <div>
                      <span className="font-medium">Duration:</span> {Math.round(result.data.transcription.duration)}s
                    </div>
                  </div>

                  {/* Transcription Text */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium text-green-700 dark:text-green-300">Transcription Text:</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(result.data.transcription.text)}
                        className="text-green-600 hover:text-green-700"
                      >
                        {copiedText ? (
                          <>
                            <Check className="w-4 h-4 mr-1" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4 mr-1" />
                            Copy
                          </>
                        )}
                      </Button>
                    </div>
                    <div className="bg-white dark:bg-green-950/50 p-4 rounded-lg border border-green-200 dark:border-green-700 max-h-60 overflow-y-auto">
                      <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">
                        {result.data.transcription.text}
                      </p>
                    </div>
                  </div>

                  {/* Segments with Timestamps */}
                  {result.data.transcription.segments && result.data.transcription.segments.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium text-green-700 dark:text-green-300">Timestamped Segments:</h4>
                      <div className="bg-white dark:bg-green-950/50 p-4 rounded-lg border border-green-200 dark:border-green-700 max-h-60 overflow-y-auto">
                        <div className="space-y-2">
                          {result.data.transcription.segments.map((segment: any, index: number) => (
                            <div key={index} className="text-sm">
                              <span className="text-blue-600 dark:text-blue-400 font-mono text-xs">
                                [{Math.floor(segment.start / 60)}:{String(Math.floor(segment.start % 60)).padStart(2, '0')} - {Math.floor(segment.end / 60)}:{String(Math.floor(segment.end % 60)).padStart(2, '0')}]
                              </span>
                              <span className="text-gray-800 dark:text-gray-200 ml-2">
                                {segment.text}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Download Buttons */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-green-700 dark:text-green-300">Download Options:</h4>
                    <div className="flex flex-wrap gap-2">
                      {Object.keys(result.data.formats).map((format) => (
                        <Button
                          key={format}
                          variant="outline"
                          size="sm"
                          onClick={() => downloadFormat(format)}
                        >
                          <Download className="w-4 h-4 mr-1" />
                          {format.toUpperCase()}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

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
              <Zap className="w-4 h-4 text-purple-600" />
              <span>High-quality AI transcription</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}