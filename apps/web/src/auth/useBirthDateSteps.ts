import { useState } from 'react';
import { API_ERROR_LABELS } from '../strings';
import { type DateParts, toBirthDate } from './birthDateParts';
import { useAnswerBirthDate } from './useAccount';

const EMPTY_DATE: DateParts = { day: '', month: '', year: '' };

export function useBirthDateSteps() {
  const answerBirthDate = useAnswerBirthDate();
  const [dateParts, setDateParts] = useState(EMPTY_DATE);
  const [dateToConfirm, setDateToConfirm] = useState<string | null>(null);
  const [isDateRejected, setIsDateRejected] = useState(false);

  function reviewDate() {
    const birthDate = toBirthDate(dateParts);
    setIsDateRejected(!birthDate);
    setDateToConfirm(birthDate);
  }

  function changeDate() {
    setDateToConfirm(null);
    answerBirthDate.reset();
  }

  function confirmDate() {
    if (!dateToConfirm || answerBirthDate.isPending) return;
    answerBirthDate.mutate(dateToConfirm, {
      onError: ({ kind }) => {
        if (kind !== 'validation') return;
        setIsDateRejected(true);
        setDateToConfirm(null);
      },
    });
  }

  function changePart(part: keyof DateParts, value: string) {
    setDateParts({ ...dateParts, [part]: value });
    setIsDateRejected(false);
    answerBirthDate.reset();
  }

  return {
    dateParts,
    dateToConfirm,
    isDateRejected,
    sendProblem: answerBirthDate.error && API_ERROR_LABELS[answerBirthDate.error.kind],
    isSending: answerBirthDate.isPending,
    reviewDate,
    changeDate,
    confirmDate,
    changePart,
  };
}
