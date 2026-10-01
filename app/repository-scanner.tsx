"use client";

import { useEffect, useRef, useState } from "react";
import { scanSelectedFiles, type BrowserScanReport } from "./browser-scan";

export function RepositoryScanner() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [report, setReport] = useState<BrowserScanReport | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.setAttribute("webkitdirectory", "");
    return () => { if (copyTimer.current) clearTimeout(copyTimer.current); };
  }, []);

  const folderName = files[0]?.webkitRelativePath.split("/")[0] || "No folder selected";

  async function scanFolder() {
    if (files.length === 0) return;
    setIsScanning(true);
    setReport(null);
    setError(null);
    try {
      setReport(await scanSelectedFiles(files));
    } catch {
      setError("The folder could not be scanned. Choose it again and retry.");
    } finally {
      setIsScanning(false);
    }
  }

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(
        "node bin/armonia.mjs scan /path/to/repository --fail-on never",
      );
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
      setError("Clipboard access is unavailable. Select and copy the command above.");
    }
  }

  function downloadReport() {
    if (!report) return;
    const blob = new Blob([`${JSON.stringify(report, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "armonia-browser-report.json";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  return (
    <section className="repository-scanner" id="scan" aria-labelledby="scan-title" aria-busy={isScanning}>
      <div className="scanner-heading">
        <div>
          <span className="section-index">03 / Browser demo</span>
          <h2 id="scan-title">Scan a folder.<br />Keep it local.</h2>
        </div>
        <p>
          Choose a repository and inspect its consistency before installing
          anything. Files are read only in this browser—nothing is uploaded.
        </p>
      </div>

      <input
        ref={inputRef}
        className="directory-input"
        type="file"
        multiple
        disabled={isScanning}
        tabIndex={-1}
        aria-label="Choose a repository folder"
        onChange={(event) => {
          setFiles(Array.from(event.target.files ?? []));
          setReport(null);
          setError(null);
        }}
      />

      <div className="scanner-controls">
        <div>
          <span className="scanner-file-label">Selected folder</span>
          <strong>{folderName}</strong>
          <small>{files.length > 0 ? `${files.length} files selected` : "Choose a repository root"}</small>
        </div>
        <div className="scanner-actions">
          <button className="button button-quiet" type="button" disabled={isScanning} onClick={() => inputRef.current?.click()}>
            Choose folder
          </button>
          <button className="button button-primary" type="button" disabled={files.length === 0 || isScanning} onClick={scanFolder}>
            {isScanning ? "Scanning…" : "Scan files"}
          </button>
        </div>
      </div>

      <p className="scanner-note">
        Preview of selected checks, not a security audit. Up to 3,000 text files, 512 KB each and 64 MiB total. Dependency and build folders are excluded.
      </p>
      {error && <p className="scanner-note" role="alert">{error}</p>}

      <div className="scanner-cli-hint">
        <span>Prefer a repeatable terminal check?</span>
        <code>node bin/armonia.mjs scan /path/to/repository --fail-on never</code>
        <button type="button" onClick={copyCommand}>
          {copied ? "Copied" : "Copy command"}
        </button>
      </div>

      {report && (
        <div className="scanner-report" aria-live="polite">
          <div className="scanner-summary">
            <div>
              <span>Score</span>
              <strong>{report.score}</strong>
              <small>grade {report.grade}</small>
            </div>
            <div>
              <span>Files</span>
              <strong>{report.files}</strong>
              <small>{report.skipped > 0 ? `${report.skipped} skipped` : "all supported files read"}</small>
            </div>
            <div>
              <span>Claims</span>
              <strong>{report.claims}</strong>
              <small>declarations read</small>
            </div>
            <div>
              <span>Findings</span>
              <strong>{report.findings.length}</strong>
              <small>{report.counts.critical} critical · {report.counts.error} errors · {report.counts.warning} warnings</small>
            </div>
          </div>

          <div className="scanner-findings">
            {report.findings.length === 0 ? (
              <p className="scanner-empty">No conflicts found in the selected files.</p>
            ) : report.findings.slice(0, 6).map((finding, index) => (
              <article className="scanner-finding" key={`${finding.ruleId}-${index}`}>
                <span className={`finding-severity severity-${finding.severity}`}>{finding.severity}</span>
                <div>
                  <strong>{finding.message}</strong>
                  <p>{finding.detail}</p>
                  <small>{finding.evidence.map((item) => `${item.source}:${item.line}`).join(" · ")}</small>
                </div>
              </article>
            ))}
            {report.findings.length > 6 && (
              <p className="scanner-more">Showing 6 of {report.findings.length} findings.</p>
            )}
          </div>
          <div className="scanner-report-actions">
            <span>Secret-shaped values are redacted from this report.</span>
            <button className="button button-quiet" type="button" onClick={downloadReport}>
              Download JSON
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
