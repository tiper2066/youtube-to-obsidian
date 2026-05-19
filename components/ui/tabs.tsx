'use client';

import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Base-UI Tabs 래퍼.
 *
 * 활성 탭은 `data-active` 속성으로 표시되며 (base-ui 규약), 우리 스타일링은 `data-active:`
 * 변형 modifier로 적용한다.
 *
 * 사용:
 *   <Tabs defaultValue='a'>
 *     <TabsList>
 *       <TabsTab value='a'>A</TabsTab>
 *       <TabsTab value='b'>B</TabsTab>
 *     </TabsList>
 *     <TabsPanel value='a'>...</TabsPanel>
 *     <TabsPanel value='b'>...</TabsPanel>
 *   </Tabs>
 */

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot='tabs'
      className={cn('flex flex-col gap-6', className)}
      {...props}
    />
  );
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot='tabs-list'
      // 좁은 화면에서 탭이 많아지면 가로 스크롤로 노출한다. `-mx-*` 패턴 없이도
      // overflow-x-auto만으로 부모 padding 안에서 자연스럽게 클리핑된다.
      className={cn(
        'border-border scrollbar-none flex items-center gap-1 overflow-x-auto border-b [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
      {...props}
    />
  );
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot='tabs-tab'
      className={cn(
        'text-muted-foreground hover:text-foreground focus-visible:outline-ring relative shrink-0 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2',
        'data-active:text-foreground',
        // 활성 탭 하단에 primary 색 underline. `bottom: -1px`로 부모 List의 border-b 위에 겹쳐 보이게 한다.
        'after:absolute after:-bottom-px after:right-0 after:left-0 after:h-0.5 after:bg-transparent after:content-[""]',
        'data-active:after:bg-primary',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    />
  );
}

/**
 * base-ui `TabsPanel`의 기본 `keepMounted`는 `false`라 탭을 떠나면 즉시 unmount되어 draft가 사라진다.
 * 설정 페이지처럼 미저장 편집을 탭 간에 유지해야 하는 케이스가 일반적이라 프로젝트 기본을 `true`로 둔다.
 * 메모리/렌더 비용이 큰 탭이 생기면 호출자가 `keepMounted={false}`로 끄면 됨.
 */
function TabsPanel({ className, keepMounted = true, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot='tabs-panel'
      keepMounted={keepMounted}
      className={cn('focus-visible:outline-ring outline-none focus-visible:outline-2', className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTab, TabsPanel };
