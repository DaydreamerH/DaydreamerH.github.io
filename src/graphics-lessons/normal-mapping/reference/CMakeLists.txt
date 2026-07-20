add_executable(29_normal_mapping main.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(29_normal_mapping glfw opengl32)
endif()

add_custom_command(TARGET 29_normal_mapping POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
    "${CMAKE_CURRENT_SOURCE_DIR}/norm_mapping.vs"
    "$<TARGET_FILE_DIR:29_normal_mapping>/normal_mapping.vs"
)

add_custom_command(TARGET 29_normal_mapping POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
    "${CMAKE_CURRENT_SOURCE_DIR}/norm_mapping.fs"
    "$<TARGET_FILE_DIR:29_normal_mapping>/normal_mapping.fs"
)

foreach(FILE_NAME brickwall.jpg brickwall_normal.jpg)
    add_custom_command(TARGET 29_normal_mapping POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_SOURCE_DIR}/images/${FILE_NAME}"
        "$<TARGET_FILE_DIR:29_normal_mapping>/${FILE_NAME}"
    )
endforeach()
