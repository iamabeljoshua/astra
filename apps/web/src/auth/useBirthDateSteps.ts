import { useRef, useState } from 'react';
import { API_ERROR_LABELS } from '../strings';
import type { DateParts } from '../ui/BirthDateField';
import { toBirthDate } from './birthDateParts';
import { useAnswerBirthDate } from './useAccount';

const EMPTY_DATE: DateParts = { day: '', month: '', year: '' };

export function useBirthDateSteps(studentName: string) {
  const answerBirthDate = useAnswerBirthDate();
  const [dateParts, setDateParts] = useState(EMPTY_DATE);
  const [dateToConfirm, setDateToConfirm] = useState<string | null>(null);
  const [isDateRejected, setIsDateRejected] = useState(false);
  // The mutation reports pending only after a tick, so a second click inside it would otherwise send twice.
  const isAnswerOnItsWay = useRef(false);

  function forgetAnswer() {
    isAnswerOnItsWay.current = false;
    answerBirthDate.reset();
  }

  function reviewDate() {
    const birthDate = toBirthDate(dateParts);
    setIsDateRejected(!birthDate);
    setDateToConfirm(birthDate);
  }

  function changeDate() {
    setDateToConfirm(null);
    forgetAnswer();
  }

  function confirmDate() {
    if (!dateToConfirm || isAnswerOnItsWay.current) return;
    isAnswerOnItsWay.current = true;
    answerBirthDate.mutate({ birthDate: dateToConfirm, name: studentName }, {
      onSettled: () => {
        isAnswerOnItsWay.current = false;
      },
      onError: ({ kind }) => {
        if (kind !== 'validation') return;
        setIsDateRejected(true);
        setDateToConfirm(null);
      },
    });
  }

  function changeParts(parts: DateParts) {
    setDateParts(parts);
    setIsDateRejected(false);
    forgetAnswer();
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
    changeParts,
  };
}
