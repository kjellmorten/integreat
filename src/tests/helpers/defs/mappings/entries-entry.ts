export default {
  id: 'entries-entry',
  type: 'entry',
  service: 'entries',
  mapping: [
    {
      $iterate: true,
      id: 'key',
      title: ['headline', { $alt: 'value', value: 'An entry' }],
      'title/1': 'originalTitle',
      text: 'body',
      createdAt: 'createdAt',
      updatedAt: 'updatedAt',
      author: 'authorId',
      sections: 'sections[]'
    },
    { $apply: 'cast_entry' }
  ]
}