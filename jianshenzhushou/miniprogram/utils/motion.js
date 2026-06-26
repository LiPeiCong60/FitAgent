const EXERCISE_OPTIONS = [
  { value: 'squat', label: '深蹲' },
  { value: 'pushup', label: '俯卧撑' },
  { value: 'plank', label: '平板支撑' }
];

const STATUS_META = {
  queued: { label: '排队中', className: 'queued' },
  processing: { label: '分析中', className: 'processing' },
  success: { label: '已完成', className: 'success' },
  failed: { label: '失败', className: 'failed' }
};

function getExerciseLabel(value) {
  const item = EXERCISE_OPTIONS.find((option) => option.value === value);
  return item ? item.label : value || '-';
}

function getStatusMeta(status) {
  return STATUS_META[status] || { label: status || '-', className: 'queued' };
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function getCountLabel(task) {
  if (!task) return '-';
  if (task.exerciseType === 'plank') {
    const duration = Number(task.duration || (task.result && task.result.duration) || 0);
    return duration > 0 ? `${duration.toFixed(1)} 秒` : '-';
  }
  const reps = Number(task.reps || (task.result && task.result.reps) || 0);
  return reps > 0 ? `${reps} 次` : '-';
}

function normalizeTask(task) {
  if (!task) return null;
  const statusMeta = getStatusMeta(task.status);
  return {
    ...task,
    exerciseLabel: getExerciseLabel(task.exerciseType),
    statusLabel: statusMeta.label,
    statusClass: statusMeta.className,
    countLabel: getCountLabel(task),
    scoreLabel: Number.isFinite(task.score) ? `${task.score}` : '-',
    createdAtText: formatDateTime(task.createdAt),
    updatedAtText: formatDateTime(task.updatedAt),
    finishedAtText: formatDateTime(task.finishedAt)
  };
}

module.exports = {
  EXERCISE_OPTIONS,
  getExerciseLabel,
  getStatusMeta,
  normalizeTask
};
