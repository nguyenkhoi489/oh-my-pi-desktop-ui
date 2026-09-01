// Logic điều hướng bàn phím cho Select view trong Permission modal
export interface SelectNavResult {
  nextIndex: number;
  submitIndex?: number;
  handled: boolean;
}

export function handleSelectKeyNav(
  key: string,
  currentIndex: number,
  optionsCount: number
): SelectNavResult {
  if (optionsCount <= 0) {
    return { nextIndex: 0, handled: false };
  }

  if (key === 'ArrowDown') {
    return {
      nextIndex: (currentIndex + 1) % optionsCount,
      handled: true,
    };
  }

  if (key === 'ArrowUp') {
    return {
      nextIndex: (currentIndex - 1 + optionsCount) % optionsCount,
      handled: true,
    };
  }

  if (key === 'Enter') {
    const validIndex = Math.max(0, Math.min(currentIndex, optionsCount - 1));
    return {
      nextIndex: validIndex,
      submitIndex: validIndex,
      handled: true,
    };
  }

  // Phím số 1-9 chọn trực tiếp và xác nhận
  if (/^[1-9]$/.test(key)) {
    const num = parseInt(key, 10);
    const targetIdx = num - 1;
    if (targetIdx < optionsCount) {
      return {
        nextIndex: targetIdx,
        submitIndex: targetIdx,
        handled: true,
      };
    }
  }

  return { nextIndex: currentIndex, handled: false };
}
