import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { LifestyleOption } from '@/types/lifestyle';

type QuestionVariant = 'boolean' | 'choice' | 'multi-choice';

interface BaseProps {
  question: string;
  subtitle?: string;
}

interface BooleanProps extends BaseProps {
  variant: 'boolean';
  value: boolean | null;
  onChange: (value: boolean) => void;
  options?: never;
  multiSelect?: never;
}

interface ChoiceProps extends BaseProps {
  variant: 'choice';
  options: LifestyleOption[];
  value: string | null;
  onChange: (value: string) => void;
  multiSelect?: never;
}

interface MultiChoiceProps extends BaseProps {
  variant: 'multi-choice';
  options: LifestyleOption[];
  value: string[];
  onChange: (value: string[]) => void;
  multiSelect?: never;
}

type LifestyleQuestionProps = BooleanProps | ChoiceProps | MultiChoiceProps;

export function LifestyleQuestion(props: LifestyleQuestionProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.question}>{props.question}</Text>
      {props.subtitle ? <Text style={styles.subtitle}>{props.subtitle}</Text> : null}

      {props.variant === 'boolean' && (
        <View style={styles.booleanRow}>
          {(['Yes', 'No'] as const).map((label) => {
            const val = label === 'Yes';
            const selected = props.value === val;
            return (
              <TouchableOpacity
                key={label}
                style={[styles.booleanTile, selected && styles.tileSelected]}
                onPress={() => props.onChange(val)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tileLabel, selected && styles.tileLabelSelected]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {(props.variant === 'choice' || props.variant === 'multi-choice') &&
        props.options.map((opt) => {
          const selected =
            props.variant === 'multi-choice'
              ? (props.value as string[]).includes(opt.value)
              : props.value === opt.value;

          function handlePress() {
            if (props.variant === 'multi-choice') {
              const current = props.value as string[];
              const next = current.includes(opt.value)
                ? current.filter((v) => v !== opt.value)
                : [...current, opt.value];
              props.onChange(next as never);
            } else {
              (props.onChange as (v: string) => void)(opt.value);
            }
          }

          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.optionTile, selected && styles.tileSelected]}
              onPress={handlePress}
              activeOpacity={0.7}
            >
              <View style={styles.optionRow}>
                <View style={styles.optionText}>
                  <Text style={[styles.tileLabel, selected && styles.tileLabelSelected]}>{opt.label}</Text>
                  {opt.description ? (
                    <Text style={[styles.optionDesc, selected && styles.optionDescSelected]}>
                      {opt.description}
                    </Text>
                  ) : null}
                </View>
                <View style={[styles.checkCircle, selected && styles.checkCircleSelected]}>
                  {selected ? <Text style={styles.checkMark}>✓</Text> : null}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
    </View>
  );
}

const ACCENT = '#E55A4E';

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  question: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  booleanRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  booleanTile: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#DDD',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
  },
  optionTile: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#DDD',
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  tileSelected: {
    borderColor: ACCENT,
    backgroundColor: '#FFF5F4',
  },
  tileLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
  },
  tileLabelSelected: {
    color: ACCENT,
    fontWeight: '600',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionText: {
    flex: 1,
  },
  optionDesc: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  optionDescSelected: {
    color: '#C0453A',
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#CCC',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  checkCircleSelected: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  checkMark: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
