import { navigation } from '../app/navigation';
import { getProfile, updateProfile } from '../app/storage';
import { normalizeVariant, type Variant } from '../gomoku/opening';
import { RULE_NAMES } from '../gomoku/renju';
import { Button } from '../ui/Button';
import { label } from '../ui/Label';
import { BasePopup } from './BasePopup';

/** Pick the rule for a pass-and-play game; each button starts it. */
export class LocalSetupPopup extends BasePopup {
  constructor(onStart: (variant: Variant) => void) {
    super('同屏双人', 560, 520);
    const profile = getProfile();
    const last = normalizeVariant(profile.rule, profile.opening);
    const options: Array<{ variant: Variant; text: string; note: string }> = [
      { variant: { rule: 'freestyle', opening: 'free' }, text: `${RULE_NAMES.freestyle} · 自由五子`, note: '五子或以上连成一线即胜' },
      { variant: { rule: 'renju', opening: 'free' }, text: `${RULE_NAMES.renju} · 黑棋有禁手`, note: '黑棋不能下三三、四四、长连，只有恰好五连才算胜' },
      { variant: { rule: 'renju', opening: 'rif' }, text: `${RULE_NAMES.renju} · 三手交换五手两打`, note: '一方先摆三手，另一方可交换；第五手给两个点让对方挑' },
    ];
    options.forEach((option, index) => {
      const { variant } = option;
      const button = new Button({
        text: option.text,
        // The rule played last time is the highlighted choice.
        skin: variant.rule === last.rule && variant.opening === last.opening ? 'yellow' : 'white',
        width: 400,
        height: 80,
        fontSize: 23,
        onPress: () => {
          updateProfile({ rule: variant.rule, opening: variant.opening });
          void navigation.dismissPopup().then(() => onStart(variant));
        },
      });
      button.y = -110 + index * 125;
      const note = label(option.note, 'small', { fontSize: 15, fill: 0xd9ccff });
      note.y = button.y + 56;
      this.body.addChild(button, note);
    });
  }
}
