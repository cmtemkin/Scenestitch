import * as React from "react";
import { useDropzone, type DropzoneOptions } from "react-dropzone";
import { cn } from "@/lib/utils";

interface FileUploadProps extends Omit<DropzoneOptions, "className"> {
  className?: string;
  children?: React.ReactNode;
  dropzoneText?: React.ReactNode;
  onFilesAccepted?: (acceptedFiles: File[]) => void;
}

export const FileUpload = React.forwardRef<HTMLDivElement, FileUploadProps>(
  ({ className, children, dropzoneText, onFilesAccepted, disabled = false, ...props }, ref) => {
    const { getRootProps, getInputProps, isDragActive } = useDropzone({
      ...props,
      disabled,
      onDrop: (acceptedFiles) => {
        if (onFilesAccepted) {
          onFilesAccepted(acceptedFiles);
        }
        if (props.onDrop) {
          props.onDrop(acceptedFiles, [], new Event("drop"));
        }
      },
    });

    return (
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer",
          isDragActive
            ? "border-primary bg-primary/5"
            : disabled
            ? "border-muted bg-background cursor-not-allowed"
            : "border-muted hover:border-muted-foreground",
          className
        )}
        ref={ref}
      >
        <input {...getInputProps()} />
        {children ? (
          children
        ) : (
          <div className="text-center space-y-2">
            <div className="text-3xl text-muted-foreground">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-10 w-10 mx-auto"
              >
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
                <path d="M12 12v6" />
                <path d="m15 15-3-3-3 3" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                {dropzoneText || "Drag & drop files here, or click to select files"}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }
);

FileUpload.displayName = "FileUpload";
