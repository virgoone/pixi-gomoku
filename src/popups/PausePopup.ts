import { navigation } from '../app/navigation';
import { setMuted } from '../app/audio';
import { getProfile } from '../app/storage';
import { Button } from '../ui/Button';
import { BasePopup } from './BasePopup';

/** In-game menu. */
export class PausePopup extends BasePopup {
  constructor(options: { onRestart?: () => void; onHome: () => void }) {
    const rows = options.onRestart ? 4 : 3;
    super('暂停', 460, 170 + rows * 96);
    const buttons: Button[] = [
      new Button({ text: '继续对局', skin: 'yellow', width: 300, icon: 'play', onPress: () => void navigation.dismissPopup() }),
    ];
    if (options.onRestart) {
      const restart = options.onRestart;
      buttons.push(new Button({ text: '重新开始', skin: 'blue', width: 300, icon: 'restart', onPress: () => void navigation.dismissPopup().then(restart) }));
    }
    const sound = new Button({
      text: getProfile().muted ? '音效：关' : '音效：开',
      skin: 'white',
      width: 300,
      icon: getProfile().muted ? 'soundOff' : 'soundOn',
      onPress: () => {
        setMuted(!getProfile().muted);
        sound.setText(getProfile().muted ? '音效：关' : '音效：开');
      },
    });
    buttons.push(sound);
    buttons.push(new Button({ text: '回到主页', skin: 'dark', width: 300, icon: 'home', onPress: () => void navigation.dismissPopup().then(options.onHome) }));
    buttons.forEach((button, index) => {
      button.y = -this.panelHeight / 2 + 140 + index * 96;
      this.body.addChild(button);
    });
  }
}
