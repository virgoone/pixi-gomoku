import { navigation } from '../app/navigation';
import { Button } from '../ui/Button';
import { label } from '../ui/Label';
import { BasePopup } from './BasePopup';

/** Two-choice question. */
export class ConfirmPopup extends BasePopup {
  constructor(options: { title: string; message: string; confirm: string; cancel?: string; onConfirm: () => void; onCancel?: () => void; danger?: boolean }) {
    super(options.title, 500, 320, false);
    const message = label(options.message, 'body', { fontSize: 20, align: 'center', wordWrap: true, wordWrapWidth: 420, lineHeight: 30 });
    message.y = -20;
    const cancel = new Button({
      text: options.cancel ?? '取消',
      skin: 'white',
      width: 190,
      height: 72,
      onPress: () => {
        void navigation.dismissPopup();
        options.onCancel?.();
      },
    });
    const confirm = new Button({
      text: options.confirm,
      skin: options.danger ? 'red' : 'yellow',
      width: 190,
      height: 72,
      onPress: () => {
        void navigation.dismissPopup().then(options.onConfirm);
      },
    });
    cancel.position.set(-108, 90);
    confirm.position.set(108, 90);
    this.body.addChild(message, cancel, confirm);
  }
}
