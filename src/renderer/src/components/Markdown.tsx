import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

interface Props {
  children: string
}

/**
 * 渲染 Markdown 文本:支持 GFM(表格/任务列表/删除线)与代码块语法高亮。
 * 默认不解析原始 HTML(不启用 rehype-raw),因此对话里出现的 <div> 等标签会被
 * 安全地当作字面文本转义显示,既防 XSS 又不会"吞掉"标签。
 */
export const Markdown = memo(function Markdown({ children }: Props): JSX.Element {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
})
