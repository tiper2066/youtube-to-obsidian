'use client';

import * as React from 'react';
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group';
import { Radio as RadioPrimitive } from '@base-ui/react/radio';

import { cn } from '@/lib/utils';

function RadioGroup<Value>({ className, ...props }: RadioGroupPrimitive.Props<Value>) {
  return (
    <RadioGroupPrimitive
      data-slot='radio-group'
      className={cn('flex flex-wrap gap-2', className)}
      {...props}
    />
  );
}

function RadioGroupItem({ className, children, ...props }: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      data-slot='radio-group-item'
      className={cn(
        'border-input data-checked:border-foreground data-checked:bg-foreground data-checked:text-background data-unchecked:hover:bg-muted data-checked:hover:bg-foreground/90 focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-8 cursor-pointer items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </RadioPrimitive.Root>
  );
}

export { RadioGroup, RadioGroupItem };
