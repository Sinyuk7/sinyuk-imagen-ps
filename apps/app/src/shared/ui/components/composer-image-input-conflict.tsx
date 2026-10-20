import { Button } from '../primitives/native-controls';

interface ComposerImageInputConflictProps {
  readonly message: string;
  readonly chooseCompatibleModelLabel: string;
  readonly removeImagesLabel: string;
  readonly onChooseCompatibleModel: () => void;
  readonly onRemoveImages: () => void;
}

/** 图片输入与模型能力冲突时，提供可直接执行的恢复操作。 */
export function ComposerImageInputConflict({
  message,
  chooseCompatibleModelLabel,
  removeImagesLabel,
  onChooseCompatibleModel,
  onRemoveImages,
}: ComposerImageInputConflictProps) {
  return (
    <div className="cmp-conflict" data-testid="composer-image-input-conflict">
      {message}
      <div className="cmp-conflict-actions">
        <Button className="cmp-conflict-action" onClick={onChooseCompatibleModel}>{chooseCompatibleModelLabel}</Button>
        <Button className="cmp-conflict-action" onClick={onRemoveImages}>{removeImagesLabel}</Button>
      </div>
    </div>
  );
}
