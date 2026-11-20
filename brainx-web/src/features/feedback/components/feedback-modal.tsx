import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Lightbulb,
  Bug,
  Sparkles,
  HelpCircle,
  ShieldCheck,
  CheckCircle2,
  Loader2,
  Send,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { submitFeedback } from '../api';
import type { FeedbackCategory } from '../types';
import { cn } from '@/lib/utils';

export interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORIES: {
  value: FeedbackCategory;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}[] = [
  {
    value: 'suggestion',
    label: 'Suggestion',
    icon: Lightbulb,
    description: 'Une idée ou amélioration',
  },
  {
    value: 'bug',
    label: 'Bug',
    icon: Bug,
    description: 'Un problème technique',
  },
  {
    value: 'recommendation',
    label: 'Recommandation',
    icon: Sparkles,
    description: 'Contenu ou cours souhaité',
  },
  {
    value: 'other',
    label: 'Autre',
    icon: HelpCircle,
    description: 'Remarque libre',
  },
];

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const location = useLocation();
  const [category, setCategory] = useState<FeedbackCategory>('suggestion');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [hpCode, setHpCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleReset = () => {
    setCategory('suggestion');
    setSubject('');
    setMessage('');
    setHpCode('');
    setIsSubmitting(false);
    setIsSuccess(false);
    setErrorMessage(null);
  };

  const handleClose = () => {
    onClose();
    // Reset state after dialog animation finishes
    setTimeout(handleReset, 200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedMsg = message.trim();
    if (trimmedMsg.length < 3) {
      setErrorMessage('Veuillez entrer un message d’au moins 3 caractères.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await submitFeedback({
        category,
        subject: subject.trim(),
        message: trimmedMsg,
        page_url: `${location.pathname}${location.search}`,
        hp_code: hpCode,
      });

      setIsSuccess(true);
    } catch {
      setErrorMessage(
        'Une erreur est survenue lors de l’envoi. Veuillez réessayer dans quelques instants.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        data-testid="feedback-modal-content"
        className="max-w-lg p-5 sm:p-6 bg-surface text-foreground border border-border shadow-2xl"
      >
        <DialogHeader className="space-y-1.5 text-left">
          <DialogTitle className="text-lg sm:text-xl font-bold flex items-center gap-2">
            <span>Boîte à suggestions & retours</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-foreground-muted">
            Partagez vos idées, recommandations ou signalez un bug.
          </DialogDescription>
        </DialogHeader>

        {isSuccess ? (
          <div
            data-testid="feedback-success-state"
            className="py-8 flex flex-col items-center justify-center text-center space-y-4"
          >
            <div className="h-14 w-14 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-foreground">
                Merci pour votre retour !
              </h3>
              <p className="text-xs sm:text-sm text-foreground-muted max-w-xs mx-auto">
                Votre suggestion a bien été transmise anonymement. Vos retours nous aident à faire progresser BrainX.
              </p>
            </div>
            <Button
              type="button"
              data-testid="feedback-success-close-button"
              onClick={handleClose}
              className="mt-2"
            >
              Fermer
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-1">
            {/* Anonymity Banner */}
            <div className="flex items-start gap-2.5 p-3 rounded-md bg-primary/10 border border-primary/20 text-xs text-foreground">
              <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span>
                <strong className="font-semibold text-primary">100% Anonyme :</strong> Aucune information personnelle ni identifiant de compte n'est enregistré.
              </span>
            </div>

            {/* Category Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Type de message
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isSelected = category === cat.value;
                  return (
                    <button
                      key={cat.value}
                      type="button"
                      data-testid={`feedback-category-${cat.value}`}
                      onClick={() => setCategory(cat.value)}
                      className={cn(
                        'flex flex-col items-center justify-center p-2.5 rounded-lg border text-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                        isSelected
                          ? 'border-primary bg-primary/15 text-primary font-semibold shadow-sm'
                          : 'border-border bg-surface-subtle hover:bg-surface-hover text-foreground-muted hover:text-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4 mb-1" />
                      <span className="text-xs leading-tight">{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Subject Field (Optional) */}
            <div className="space-y-1.5">
              <label htmlFor="feedback-subject" className="text-xs font-semibold text-foreground">
                Sujet <span className="text-foreground-muted font-normal">(facultatif)</span>
              </label>
              <Input
                id="feedback-subject"
                data-testid="feedback-subject-input"
                placeholder="Ex: Lecteur vidéo, cours d'économie..."
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                disabled={isSubmitting}
              />
            </div>

            {/* Message Field */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label htmlFor="feedback-message" className="text-xs font-semibold text-foreground">
                  Votre message <span className="text-destructive">*</span>
                </label>
                <span className="text-[11px] text-foreground-muted">
                  {message.length}/5000
                </span>
              </div>
              <textarea
                id="feedback-message"
                data-testid="feedback-message-input"
                rows={4}
                required
                placeholder="Détaillez votre retour, vos remarques ou suggestions..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={5000}
                disabled={isSubmitting}
                className={cn(
                  'flex w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground',
                  'placeholder:text-foreground-subtle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                  'disabled:cursor-not-allowed disabled:opacity-50 select-text resize-none'
                )}
              />
            </div>

            {/* Honeypot field (hidden to regular users, catches bots) */}
            <div className="sr-only" aria-hidden="true">
              <label htmlFor="hp_code">Ne pas remplir si vous êtes humain</label>
              <input
                id="hp_code"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={hpCode}
                onChange={(e) => setHpCode(e.target.value)}
              />
            </div>

            {/* Error banner */}
            {errorMessage && (
              <div
                data-testid="feedback-error-banner"
                className="p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-destructive font-medium"
              >
                {errorMessage}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="ghost"
                onClick={handleClose}
                disabled={isSubmitting}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                data-testid="feedback-submit-button"
                disabled={isSubmitting || message.trim().length < 3}
                className="gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Envoi en cours...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    <span>Envoyer la suggestion</span>
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
