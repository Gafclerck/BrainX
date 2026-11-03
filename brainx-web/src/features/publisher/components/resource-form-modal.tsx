import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, Loader2, UploadCloud, Link as LinkIcon } from 'lucide-react';
import { createResource } from '../api';
import type {
  PublisherResourceType,
  PublisherResourceItem,
  CreateResourcePayload,
} from '../types';
import { ApiError } from '@/lib/api';

export interface ResourceFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  lessonId: string;
  onSuccess: (newResource: PublisherResourceItem) => void;
}

const MAX_FILE_SIZE = 52_428_800; // 50 MB in bytes
const ALLOWED_DOCUMENT_EXTENSIONS = ['.pdf'];
const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
const HTTP_URL_REGEX = /^https?:\/\//i;

export function ResourceFormModal({
  isOpen,
  onClose,
  lessonId,
  onSuccess,
}: ResourceFormModalProps) {
  const [type, setType] = useState<PublisherResourceType>('document');
  const [title, setTitle] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string>('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const typeSelectRef = useRef<HTMLSelectElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setType('document');
      setTitle('');
      setNote('');
      setFile(null);
      setUrl('');
      setFieldErrors({});
      setGeneralError(null);
      setIsSubmitting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [isOpen]);

  const handleOpenChange = (open: boolean) => {
    if (!open && !isSubmitting) {
      onClose();
    }
  };

  const isFileBearing = type === 'document' || type === 'image';
  const isUrlBearing = type === 'video' || type === 'external_link';

  const handleTypeChange = (newType: PublisherResourceType) => {
    setType(newType);
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setUrl('');
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.file;
      delete next.url;
      delete next.type;
      return next;
    });
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    // Validate Title
    if (!title.trim()) {
      errors.title = 'Le titre est obligatoire.';
    } else if (title.trim().length > 255) {
      errors.title = 'Le titre ne doit pas dépasser 255 caractères.';
    }

    // Validate Payload according to type
    if (isFileBearing) {
      if (!file) {
        errors.file = 'Veuillez sélectionner un fichier.';
      } else {
        // File size check (50 MB limit)
        if (file.size > MAX_FILE_SIZE) {
          errors.file = 'Le fichier ne doit pas dépasser 50 Mo.';
        } else {
          // Extension check
          const lastDotIndex = file.name.lastIndexOf('.');
          const ext =
            lastDotIndex >= 0
              ? file.name.slice(lastDotIndex).toLowerCase()
              : '';

          if (type === 'document' && !ALLOWED_DOCUMENT_EXTENSIONS.includes(ext)) {
            errors.file =
              'Les extensions autorisées pour un document sont : .pdf';
          } else if (
            type === 'image' &&
            !ALLOWED_IMAGE_EXTENSIONS.includes(ext)
          ) {
            errors.file =
              'Les extensions autorisées pour une image sont : .png, .jpg, .jpeg, .webp';
          }
        }
      }
    } else if (isUrlBearing) {
      const trimmedUrl = url.trim();
      if (!trimmedUrl) {
        errors.url = "L'adresse URL est obligatoire.";
      } else {
        try {
          const parsed = new URL(trimmedUrl);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            errors.url = "L'URL doit obligatoirement commencer par http:// ou https://";
          } else if (!parsed.hostname) {
            errors.url = "L'adresse URL doit comporter un nom d'hôte valide.";
          }
        } catch {
          errors.url = "L'URL doit obligatoirement commencer par http:// ou https://";
        }
      }
    }

    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      if (errors.type) {
        typeSelectRef.current?.focus();
      } else if (errors.title) {
        titleInputRef.current?.focus();
      } else if (errors.file) {
        fileInputRef.current?.focus();
      } else if (errors.url) {
        urlInputRef.current?.focus();
      } else if (errors.note) {
        noteInputRef.current?.focus();
      }
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: CreateResourcePayload = {
        type,
        title: title.trim(),
        note: note.trim() || undefined,
        ...(isFileBearing ? { file } : { url: url.trim() }),
      };

      const newResource = await createResource(lessonId, payload);
      onSuccess(newResource);
      onClose();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        const errors = err.envelope.errors || {};
        const newFieldErrors: Record<string, string> = {};
        const nonFieldList: string[] = [];

        for (const [key, msgs] of Object.entries(errors)) {
          const firstMsg = Array.isArray(msgs) ? msgs[0] : String(msgs);
          if (['title', 'note', 'file', 'url', 'type'].includes(key)) {
            newFieldErrors[key] = firstMsg;
          } else {
            const formatted =
              key === 'non_field_errors' || key === '__all__' || key === 'detail'
                ? firstMsg
                : `${key}: ${firstMsg}`;
            nonFieldList.push(formatted);
          }
        }

        setFieldErrors(newFieldErrors);

        if (nonFieldList.length > 0) {
          setGeneralError(nonFieldList.join(' '));
        } else if (Object.keys(newFieldErrors).length === 0) {
          setGeneralError(
            err.envelope.detail ||
              'Une erreur de validation est survenue sur le serveur.'
          );
        }

        setIsSubmitting(false);

        const focusTarget = () => {
          if (newFieldErrors.type) {
            typeSelectRef.current?.focus();
          } else if (newFieldErrors.title) {
            titleInputRef.current?.focus();
          } else if (newFieldErrors.file) {
            fileInputRef.current?.focus();
          } else if (newFieldErrors.url) {
            urlInputRef.current?.focus();
          } else if (newFieldErrors.note) {
            noteInputRef.current?.focus();
          }
        };

        focusTarget();
        setTimeout(focusTarget, 0);
      } else if (err instanceof Error) {
        setGeneralError(err.message);
      } else {
        setGeneralError('Une erreur inattendue est survenue.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        data-testid="resource-form-modal"
        className="w-[calc(100%-2rem)] sm:max-w-lg bg-card border-border text-foreground p-6 rounded-lg shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader className="space-y-2">
          <DialogTitle
            data-testid="resource-modal-title"
            className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2"
          >
            {isFileBearing ? (
              <UploadCloud className="h-5 w-5 text-primary" aria-hidden="true" />
            ) : (
              <LinkIcon className="h-5 w-5 text-primary" aria-hidden="true" />
            )}
            <span>Ajouter une ressource pédagogique</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-foreground-muted">
            Associez un document, une image ou un lien externe à cette leçon pour vos étudiants.
          </DialogDescription>
        </DialogHeader>

        {generalError && (
          <div
            role="alert"
            data-testid="resource-modal-error"
            className="rounded-lg border border-destructive-border bg-destructive-surface p-3 flex items-start gap-2.5 text-xs text-destructive mt-2"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span className="flex-1 leading-relaxed">{generalError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-2" noValidate>
          {/* Resource Type Selector */}
          <div className="space-y-1.5">
            <label
              htmlFor="resource-type-select"
              className="block text-xs font-semibold text-foreground uppercase tracking-wider"
            >
              Type de ressource <span className="text-destructive">*</span>
            </label>
            <select
              id="resource-type-select"
              ref={typeSelectRef}
              data-testid="resource-type-select"
              value={type}
              onChange={(e) =>
                handleTypeChange(e.target.value as PublisherResourceType)
              }
              disabled={isSubmitting}
              aria-invalid={!!fieldErrors.type}
              aria-describedby={fieldErrors.type ? 'resource-type-error' : undefined}
              className={`w-full min-h-[44px] px-3 py-2 bg-surface border rounded-md text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-transparent transition-colors ${
                fieldErrors.type ? 'border-destructive focus:ring-destructive' : 'border-border'
              }`}
            >
              <option value="document">Document (.pdf)</option>
              <option value="image">Image (.png, .jpg, .jpeg, .webp)</option>
              <option value="video">Vidéo (URL)</option>
              <option value="external_link">Lien externe (URL)</option>
            </select>
            {fieldErrors.type && (
              <p
                id="resource-type-error"
                role="alert"
                data-testid="resource-type-error"
                className="text-xs text-destructive font-medium flex items-center gap-1 mt-1"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{fieldErrors.type}</span>
              </p>
            )}
          </div>

          {/* Title input */}
          <div className="space-y-1.5">
            <label
              htmlFor="resource-title-input"
              className="block text-xs font-semibold text-foreground uppercase tracking-wider"
            >
              Titre de la ressource <span className="text-destructive">*</span>
            </label>
            <Input
              id="resource-title-input"
              ref={titleInputRef}
              data-testid="resource-title-input"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (fieldErrors.title) {
                  setFieldErrors((prev) => {
                    const next = { ...prev };
                    delete next.title;
                    return next;
                  });
                }
              }}
              disabled={isSubmitting}
              placeholder="Ex: Polycopié de cours - Séance 1"
              aria-invalid={!!fieldErrors.title}
              aria-describedby={
                fieldErrors.title ? 'resource-title-error' : undefined
              }
              className={`min-h-[44px] text-sm bg-surface ${
                fieldErrors.title
                  ? 'border-destructive focus:ring-destructive'
                  : ''
              }`}
            />
            {fieldErrors.title && (
              <p
                id="resource-title-error"
                role="alert"
                data-testid="resource-title-error"
                className="text-xs text-destructive font-medium flex items-center gap-1 mt-1"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{fieldErrors.title}</span>
              </p>
            )}
          </div>

          {/* Conditional Input: File for Document / Image */}
          {isFileBearing && (
            <div className="space-y-1.5">
              <label
                htmlFor="resource-file-input"
                className="block text-xs font-semibold text-foreground uppercase tracking-wider"
              >
                Fichier{' '}
                <span className="text-foreground-muted font-normal lowercase">
                  ({type === 'document' ? '.pdf' : '.png, .jpg, .jpeg, .webp'})
                </span>{' '}
                <span className="text-destructive">*</span>
              </label>
              <input
                id="resource-file-input"
                ref={fileInputRef}
                type="file"
                data-testid="resource-file-input"
                accept={
                  type === 'document'
                    ? '.pdf,application/pdf'
                    : '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp'
                }
                onChange={(e) => {
                  const selectedFile = e.target.files?.[0] || null;
                  setFile(selectedFile);
                  if (fieldErrors.file) {
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next.file;
                      return next;
                    });
                  }
                }}
                disabled={isSubmitting}
                aria-invalid={!!fieldErrors.file}
                aria-describedby={
                  fieldErrors.file ? 'resource-file-error' : undefined
                }
                className="w-full text-xs text-foreground-muted file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-surface file:text-foreground hover:file:bg-surface/80 file:cursor-pointer cursor-pointer border border-border rounded-md p-2 bg-surface/30 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-border-focus"
              />
              <p className="text-[11px] text-foreground-muted">
                Taille maximale : 50 Mo (52 428 800 octets).
              </p>
              {fieldErrors.file && (
                <p
                  id="resource-file-error"
                  role="alert"
                  data-testid="resource-file-error"
                  className="text-xs text-destructive font-medium flex items-center gap-1 mt-1"
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{fieldErrors.file}</span>
                </p>
              )}
            </div>
          )}

          {/* Conditional Input: URL for Video / External Link */}
          {isUrlBearing && (
            <div className="space-y-1.5">
              <label
                htmlFor="resource-url-input"
                className="block text-xs font-semibold text-foreground uppercase tracking-wider"
              >
                Adresse URL externe <span className="text-destructive">*</span>
              </label>
              <Input
                id="resource-url-input"
                ref={urlInputRef}
                type="url"
                data-testid="resource-url-input"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (fieldErrors.url) {
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next.url;
                      return next;
                    });
                  }
                }}
                disabled={isSubmitting}
                placeholder="https://example.com/ressource"
                aria-invalid={!!fieldErrors.url}
                aria-describedby={
                  fieldErrors.url ? 'resource-url-error' : undefined
                }
                className={`min-h-[44px] text-sm bg-surface font-mono ${
                  fieldErrors.url
                    ? 'border-destructive focus:ring-destructive'
                    : ''
                }`}
              />
              <p className="text-[11px] text-foreground-muted">
                L'adresse doit obligatoirement commencer par http:// ou https://.
              </p>
              {fieldErrors.url && (
                <p
                  id="resource-url-error"
                  role="alert"
                  data-testid="resource-url-error"
                  className="text-xs text-destructive font-medium flex items-center gap-1 mt-1"
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{fieldErrors.url}</span>
                </p>
              )}
            </div>
          )}

          {/* Note / Description (optional) */}
          <div className="space-y-1.5">
            <label
              htmlFor="resource-note-input"
              className="block text-xs font-semibold text-foreground uppercase tracking-wider"
            >
              Note / Consigne{' '}
              <span className="text-foreground-muted font-normal text-[10px] lowercase">
                (optionnelle)
              </span>
            </label>
            <textarea
              id="resource-note-input"
              ref={noteInputRef}
              data-testid="resource-note-input"
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                if (fieldErrors.note) {
                  setFieldErrors((prev) => {
                    const next = { ...prev };
                    delete next.note;
                    return next;
                  });
                }
              }}
              disabled={isSubmitting}
              rows={3}
              placeholder="Instructions pour les étudiants, contexte ou chapitres concernés..."
              aria-invalid={!!fieldErrors.note}
              aria-describedby={
                fieldErrors.note ? 'resource-note-error' : undefined
              }
              className={`w-full min-h-[80px] p-3 rounded-md text-sm bg-surface border text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:border-transparent transition-colors ${
                fieldErrors.note
                  ? 'border-destructive focus:ring-destructive'
                  : 'border-border focus:ring-border-focus'
              }`}
            />
            {fieldErrors.note && (
              <p
                id="resource-note-error"
                role="alert"
                data-testid="resource-note-error"
                className="text-xs text-destructive font-medium flex items-center gap-1 mt-1"
              >
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{fieldErrors.note}</span>
              </p>
            )}
          </div>

          {/* Modal Actions */}
          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              data-testid="cancel-resource-btn"
              onClick={onClose}
              disabled={isSubmitting}
              className="min-h-[44px] min-w-[44px] border-border text-xs sm:text-sm"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              variant="default"
              data-testid="submit-resource-btn"
              disabled={isSubmitting}
              className="min-h-[44px] min-w-[44px] bg-primary text-primary-foreground hover:bg-primary-hover text-xs sm:text-sm font-medium shadow-sm inline-flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Ajout en cours...</span>
                </>
              ) : (
                <span>Ajouter la ressource</span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
