import { navigation } from '../app/navigation';
import { getProfile, updateProfile } from '../app/storage';
import { RULE_NAMES } from '../gomoku/renju';
import type { Rule } from '../gomoku/rules';
import { Button } from '../ui/Button';
import { label } from '../ui/Label';
import { BasePopup } from './BasePopup';

/** Pick the rule for a pass-and-play game; either button starts it. */
export class LocalSetupPopup extends BasePopup {
  constructor(onStart: (rule: Rule) => void) {
    super('同屏双人', 560, 400);
    const last = getProfile().rule;
    const options: Array<{ rule: Rule; text: string; note: string }> = [
      { rule: 'freestyle', text: `${RULE_NAMES.freestyle} · 自由五子`, note: '五子或以上连成一线即胜' },
      { rule: 'renju', text: `${RULE_NAMES.renju} · 黑棋有禁手`, note: '黑棋不能下三三、四四、长连，只有恰好五连才算胜' },
    ];
    options.forEach((option, index) => {
      const button = new Button({
        text: option.text,
        // The rule played last time is the highlighted choice.
        skin: option.rule === last ? 'yellow' : 'white',
        width: 380,
        height: 80,
        fontSize: 24,
        onPress: () => {
          updateProfile({ rule: option.rule });
          void navigation.dismissPopup().then(() => onStart(option.rule));
        },
      });
      button.y = -55 + index * 125;
      const note = label(option.note, 'small', { fontSize: 15, fill: 0xd9ccff });
      note.y = button.y + 56;
      this.body.addChild(button, note);
    });
  }
}
